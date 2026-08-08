---
description: Espelha o código do repo no cache do plugin e troca o hub em execução
allowed-tools: Bash(bun:*)
---

Rode a partir da raiz do repositório do plugin:

```
bun "${CLAUDE_PLUGIN_ROOT}/scripts/update.ts"
```

Use `--check` para ver o que aconteceria sem mexer em nada.

O script faz a dança inteira do deploy local:

1. espelha `src/`, `web/`, `hooks/`, `commands/` e o `plugin.json` do repo em **todos** os
   diretórios de versão do cache — uma sessão antiga respawna o hub do próprio root, e um
   diretório esquecido devolve código velho no primeiro respawn;
2. mata quem escuta a porta do hub (pelo PID vindo do `ss`, nunca por padrão de texto: um
   `pkill -f` com o caminho no padrão mata o próprio shell que rodou o comando);
3. espera o hub voltar e confirma o PID novo;
4. avisa se a unit do systemd aponta para um diretório que não existe mais.

Antes de rodar, avise que **a página web cai por alguns segundos** — ela reconecta sozinha,
mas quem estiver com uma versão antiga do `app.js` carregada pode precisar de um refresh.

O `plugin install/update` do Claude Code puxa do marketplace remoto (GitHub) e não vê o
código local: para testar o que ainda não foi publicado, este comando é o caminho. Se você
publicou e quer o fluxo oficial, aí sim bumpe a versão, dê push e use
`claude plugin update <plugin>@<marketplace>`.
