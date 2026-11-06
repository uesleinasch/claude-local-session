# Política de segurança

O Local Session expõe sessões do Claude Code numa porta da rede local, e a página pode aprovar
comandos `Bash`. Uma falha aqui pode virar execução de código na máquina de quem usa, por isso
relatos de segurança têm prioridade.

> **English:** please report vulnerabilities privately through GitHub's
> [private vulnerability reporting](https://github.com/uesleinasch/claude-local-session/security/advisories/new),
> never in a public issue.

## Versões com suporte

Só a última release recebe correções de segurança. Veja a versão em
[Releases](https://github.com/uesleinasch/claude-local-session/releases/latest).

## Como relatar

Use o **relato privado de vulnerabilidade** do GitHub:
[abrir um relato](https://github.com/uesleinasch/claude-local-session/security/advisories/new).
**Não** abra issue pública nem pull request com a falha.

Inclua, se puder:

- versão do hub (`local-session status`) e, se for o caso, do app;
- passo a passo para reproduzir;
- o impacto que você vê (o que um atacante consegue e de onde: mesma rede, tailnet ou internet).

Você recebe uma resposta em até 7 dias. A correção sai numa release, e o crédito vai para você
no aviso de segurança, se quiser.

## O que está no escopo

As fronteiras que o projeto se compromete a manter, descritas no [CLAUDE.md](CLAUDE.md):

- **token:** toda requisição ao hub exige o token, e sem ele a resposta é sempre 404;
- **caminhos:** `spawn`, `browse`, `mkdir`, `copy`, `find` e `/_download` passam o caminho por
  `realpath` e só aceitam o que está dentro da home e dos `projectsRoot`;
- **downloads:** `/_download` nunca serve conteúdo que o navegador renderize na origem do hub;
- **teclas:** as teclas mandadas ao tmux vêm de uma allowlist;
- **app Android:** a WebView só navega para o host pareado, e o texto que entra pela ponte nunca é
  concatenado como código.

Quebrar qualquer uma delas é vulnerabilidade.

## Fora do escopo

- O que exige acesso prévio à conta do usuário na máquina ou ao arquivo de configuração com o
  token (`~/.claude/local-session/config.json`).
- O tráfego HTTP em texto claro na rede local: é uma limitação conhecida e documentada. Para
  acesso de fora, use a tailnet.
- Falhas no Claude Code, no Tailscale ou no ntfy: relate ao projeto de cada um.
