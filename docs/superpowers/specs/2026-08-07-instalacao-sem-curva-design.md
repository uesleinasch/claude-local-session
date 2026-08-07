# Instalação sem curva — design

Data: 2026-08-07

## Problema

Instalar o plugin não basta para ele funcionar. O canal do Claude Code é protegido por três
camadas, e todas precisam ser satisfeitas antes do primeiro prompt chegar ao modelo:

| Camada                  | Onde                          | Exige root |
| ----------------------- | ----------------------------- | ---------- |
| `channelsEnabled`       | `/etc/claude-code/managed-settings.json` | sim |
| `allowedChannelPlugins` | mesmo arquivo                 | sim        |
| `--channels`            | flag, por sessão              | não        |

Descobrir isso custou uma sessão inteira de depuração, porque cada camada só se revela depois
de vencida a anterior e o descarte é silencioso do lado do Claude. Ninguém mais deveria pagar
esse custo — nem o autor numa máquina recém-formatada, nem outra pessoa que queira usar.

Objetivo: **um comando numa máquina nova deixa tudo funcionando**, e o uso diário não exige
lembrar de nada.

## Escopo

Dentro:

- Instalador único que resolve dependências, instala o plugin e configura as três camadas.
- Reparo a partir de dentro do Claude Code, para máquina já instalada.
- Alias que sobrepõe `claude`, para o canal não depender de memória.

Fora:

- Autoconfiguração no primeiro boot do plugin. Um plugin que dispara pedido de senha sem o
  usuário ter pedido é exatamente o que a barreira de root existe para impedir.
- Suporte a shell fora de zsh e bash.
- Instalação do próprio Claude Code.

## Decisão: o alias sobrepõe `claude`

```bash
alias claude='claude --channels plugin:local-session@unac'
```

Aliases de shell não são recursivos, então isso não gera laço. O efeito é que toda sessão passa
a exibir o banner `Channels (experimental)` do Claude Code.

O custo é real e foi aceito conscientemente: a alternativa (`claudew` separado) preserva sessões
limpas mas transfere para a pessoa a obrigação de lembrar — e o dia de esquecer é justamente o
dia em que ela sai da mesa e queria acompanhar pelo celular.

## Arquitetura

```
install.sh                    scripts/setup.ts              commands/setup.md
(casca fina, bash)     ──▶    (toda a lógica, TS)    ◀──    (/local-session:setup)
 · checa claude/bun            · merge dos settings          repara máquina
 · instala o plugin            · merge das permissões        já instalada
 · chama o setup               · alias idempotente
                               · elevação sudo/pkexec
```

Uma fonte de verdade para a lógica de configuração. O `install.sh` existe porque numa máquina
nova ainda não há plugin — e portanto não há `setup.ts` — até o passo 2 terminar.

### Elevação de privilégio adaptativa

`sudo` quando há TTY, `pkexec` quando não há. É isso que permite o mesmo código servir aos dois
pontos de entrada: no terminal o `sudo` pede a senha normalmente; dentro do Claude Code, onde
não existe TTY, o `pkexec` abre o diálogo gráfico do ambiente de desktop.

A escrita elevada acontece num **único** comando (`mkdir && cp && chmod`), porque cada invocação
de `pkexec` gera um diálogo de senha próprio.

### Regra do merge

O merge **só acrescenta**. Preserva qualquer chave desconhecida do arquivo e qualquer entrada
de allowlist que já esteja lá — inclusive entradas que uma política de organização venha a
adicionar depois. Remover é sempre ação humana explícita, nunca do script.

## Etapas do instalador

1. **Dependências** — `claude` é obrigatório (aborta com instrução se faltar); `bun` é instalado
   via `bun.sh/install` se ausente, já que o MCP server não roda sem ele.
2. **Plugin** — `claude plugin marketplace add` e `claude plugin install`.
3. **Managed settings** — merge elevado, com diff impresso antes de pedir a senha.
4. **Permissão do `reply`** — merge em `~/.claude/settings.json`, sem root. Elimina a aprovação
   manual a cada resposta do Claude, mantendo `Bash` e o resto sob confirmação.
5. **Alias** — escrito no rc do shell detectado, entre marcadores, para reexecução não duplicar.
6. **Relatório** — o que mudou, o que já estava certo, e o próximo passo.

Toda etapa é idempotente: rodar duas vezes não duplica nada e não pede senha se o arquivo
elevado já estiver correto.

## Superfície testável

As funções de decisão não tocam disco — recebem conteúdo e caminho por parâmetro:

| Função                   | Contrato                                                        |
| ------------------------ | --------------------------------------------------------------- |
| `mergeManagedSettings`   | acrescenta a entrada e `channelsEnabled`, preserva o resto      |
| `mergeUserPermissions`   | acrescenta a tool em `permissions.allow` sem duplicar           |
| `detectPluginIdentity`   | extrai `{plugin, marketplace}` do caminho de instalação         |
| `ensureAliasBlock`       | insere ou atualiza o bloco marcado, idempotente                 |
| `rcPathFor`              | escolhe `.zshrc` / `.bashrc` a partir do shell                  |

Os testes cobrem: preservação de entradas alheias, ausência de duplicata em reexecução, caminho
de instalação inesperado, e atualização do alias quando o marketplace muda.

## Segurança

`curl | bash` executa código remoto sem revisão prévia. É o que entrega a curva zero pedida, e
fica documentado — mas a forma "clonar, ler, executar" vem primeiro no README, porque é a
recomendação honesta para quem não é o autor do repositório.

O instalador escreve em `/etc`, o que é uma elevação real de privilégio. Mitigações: o diff é
impresso antes da senha, o merge nunca remove, e o alvo é um caminho fixo — não construído a
partir de entrada externa.
