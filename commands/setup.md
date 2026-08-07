---
description: Configura o canal desta máquina — managed settings, permissão da tool reply e alias
allowed-tools: Bash(bun:*)
---

Execute o setup do plugin:

```
bun "${CLAUDE_PLUGIN_ROOT}/scripts/setup.ts"
```

O script é idempotente: o que já estiver certo aparece com `✓` e nada é reescrito. O que ele
alterar aparece com `▸`.

Escrever em `/etc/claude-code/managed-settings.json` exige privilégio. Como não há TTY aqui
dentro, o script usa `pkexec` e um diálogo de senha aparece na tela do usuário — avise que isso
vai acontecer antes de rodar, para o diálogo não surgir sem contexto.

Depois de apresentar o resultado, lembre o usuário de que:

- alterações no `.zshrc` só valem em terminais abertos depois, ou após um `source`;
- o `managed-settings.json` só é lido quando a sessão do Claude Code inicia, então a
  configuração nova vale a partir da próxima sessão.

Se o usuário cancelar o diálogo de senha, o script segue e aplica o resto — diga quais camadas
ficaram pendentes em vez de tratar como falha total.
