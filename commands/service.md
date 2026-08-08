---
description: Instala o hub como serviço de usuário do systemd — de pé desde o boot
allowed-tools: Bash(bun:*)
---

O `/local-session:setup` (e o `install.sh`) já instalam o serviço — este comando existe para
reconfigurar depois, por exemplo quando a unit ficou apontando para uma versão que saiu do
cache.

```
bun "${CLAUDE_PLUGIN_ROOT}/scripts/service.ts"
```

O script é idempotente: o que já estiver certo aparece com `✓`, o que ele mudar com `▸`.
Use `--check` para só diagnosticar e `--disable` para parar e desabilitar.

Sem o serviço, o hub só sobe quando a primeira sessão do Claude Code abre — depois de um
reboot, a página não responde até alguém abrir um terminal. Com ele, o celular funciona
desde o boot.

Dois pontos a explicar ao usuário depois de rodar:

- **linger**: sem ele o serviço de usuário só existe enquanto há sessão de login aberta.
  O script tenta ligar sozinho; se faltar privilégio, mostre o comando com `sudo` que ele
  precisa rodar no terminal.
- **a unit aponta para o diretório atual do plugin**, que muda a cada versão instalada.
  Depois de atualizar o plugin, rode `/local-session:update` (que reescreve a unit) ou este
  comando de novo.
