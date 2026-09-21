# Pacote `.deb` — design

Data: 2026-09-21

## Problema

Instalar hoje exige `git clone` ou `curl | bash`, ter o `bun` no PATH e um `sudo` para o
`managed-settings.json`. Serve para quem leu o README inteiro, não para quem só quer usar.

O executável único (0.10.0) tirou o `bun` da equação e é pré-requisito deste trabalho: sem ele
o pacote precisaria carregar um runtime e uma árvore de `node_modules` por usuário. Com ele,
sobra empacotar e resolver o que o `apt` faz melhor que um script: privilégio na hora da
instalação, dependência declarada e desinstalação limpa.

Objetivo: **`apt install` mais um comando por usuário**, e nada de falha silenciosa no meio.

## O que decidiu o desenho

Três fatos verificados em 2026-09-21, dois deles derrubando suposições de agosto:

1. **`claude plugin marketplace add` aceita caminho de disco** (`add <source>` — "a URL, path,
   or GitHub repo", com `--scope user|project|local`). Era a incógnita que o roadmap dizia
   decidir a viabilidade. Caiu: o pacote pode entregar o plugin e registrá-lo sem rede.
2. **`claude plugin install` a partir de um caminho em disco copia a árvore** para
   `~/.claude/plugins/cache/` de cada usuário. Medido com um plugin de 3 MB: o cache ficou com
   2,9 MB, diretório real, não symlink. Portanto o binário de 92 MB **não pode** morar dentro da
   árvore do plugin — seriam 92 MB por usuário.
3. **O registro do plugin é por usuário**, e o `postinst` roda como root antes de o usuário
   existir na equação. Não há como registrar por quem ainda não logou.

O fato 2 é o que separa este design do desenho de agosto: o pacote tem **duas árvores**, uma
pesada de sistema e uma leve que vira cópia.

## Escopo

Dentro: o `.deb`, o `postinst`/`postrm`, o subcomando que aplica o managed-settings com
privilégio, e o aviso de plugin desatualizado.

Fora: repositório APT e assinatura (distribuição é `.deb` baixado); `.rpm`; instalar o Claude
Code; instalar o Tailscale — decisão de 2026-08-21 que continua valendo, porque o passo que
trava é o login interativo, fora do alcance de qualquer `postinst`.

## Conteúdo do pacote

| caminho | conteúdo | por quê |
| --- | --- | --- |
| `/usr/bin/local-session` | o executável (92 MB) | fora da árvore copiada por usuário |
| `/usr/share/local-session/` | `.claude-plugin/`, `hooks/`, `commands/`, `bin/local-session` | ~20 KB; é o que vira cópia no cache |
| `/usr/lib/systemd/user/local-session-hub.service` | unit de usuário instalada pelo sistema | cada usuário só faz `enable --now`, sem escrever na home |

Sem `src/` e sem `web/`: ambos estão dentro do binário. Instalar `web/` em `/usr/share` criaria
uma segunda fonte de verdade para os assets, que o `LOCAL_SESSION_WEB_DIR` já cobre quando for
preciso.

`Depends: tmux` resolve em tempo de pacote o que hoje é `Bun.which` em runtime — onde a ausência
só apaga botões da página sem dizer por quê.

O shim `bin/local-session` já procura, nesta ordem, `dist/local-session`, o `local-session` do
PATH e o fonte com `bun`. É o segundo caso que faz a cópia no cache de cada usuário encontrar o
binário do sistema.

## O `postinst` chama o próprio binário

`mergeManagedSettings` preserva entradas de allowlist alheias — inclusive as que uma política de
organização venha a adicionar depois — e trata arquivo corrompido como conteúdo de terceiros que
não se sobrescreve. Reescrever isso em shell perderia o cuidado.

Então o `postinst` roda `local-session managed-settings --apply`: subcomando novo, já com
privilégio de root, reusando o núcleo puro que existe e é testado. O `postrm purge` roda
`--remove`, que tira **só** a entrada deste plugin.

Sem TTY e sem `pkexec` nesse contexto: o subcomando escreve direto e falha com mensagem se não
tiver permissão, em vez de tentar elevar.

## Aviso de plugin desatualizado

O `apt upgrade` troca o binário, mas a cópia no cache de cada usuário continua velha. Na maioria
das versões isso é inócuo — o que muda é o binário, e a cópia só aponta para ele. Quando um
manifesto mudar (hook novo, subcomando novo), o sintoma seria silencioso, que é a doença crônica
deste projeto.

O binário embute o próprio `plugin.json`. No boot, o hub compara essa versão com a do
`plugin.json` da raiz do plugin (a cópia) e, divergindo, manda o par para a página, que mostra
uma tarja com o comando exato. Falha silenciosa vira falha visível.

Isso toca `protocol.ts`, `hub.ts` e `web/app.js` — o trio que o `CLAUDE.md` avisa não ter rede de
proteção — então a regra fica no núcleo (`pluginMismatch`, puro e testado) e a tarja entra nos
contratos de `tests/web-css.test.ts`.

## Construção

`src/package-core.ts` (puro, testado) gera o `control`, o `postinst`, o `postrm` e a lista de
arquivos. `scripts/package.ts` monta a árvore num diretório temporário e chama `dpkg-deb
--build`. A versão do pacote sai do `plugin.json`, como já acontece no deploy.

Onde `dpkg-deb` não existe, o script diz isso e sai — não tenta emular o formato.

## Instalação, do começo ao fim

```
sudo apt install ./local-session_0.11.0_amd64.deb   # binário, plugin, unit, managed-settings
local-session setup                                  # registra o plugin, o alias e o serviço
```

O `setup` ganha um passo novo: registrar o marketplace por caminho e instalar o plugin, quando
ainda não estiverem registrados. Os outros quatro passos já existem e já são idempotentes.

## Riscos

- **Arquitetura**: `bun build --compile` produz binário por plataforma; o pacote é `amd64` e
  declara isso. Outras arquiteturas ficam com o `install.sh`.
- **92 MB**: é o runtime do Bun, não o nosso código. O `.deb` comprime, mas o instalado é esse.
- **`/usr/lib/systemd/user/`**: a unit fica disponível para todo usuário da máquina, mas só roda
  para quem der `enable`. É o comportamento pretendido.
- **Sem assinatura**: `apt` vai avisar. Documentar, não esconder.
