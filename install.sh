#!/usr/bin/env bash
set -euo pipefail

REPO="${LOCAL_SESSION_REPO:-uesleinasch/claude-local-session}"
PLUGIN=local-session
MARKETPLACE=unac

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
die() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

command -v claude >/dev/null 2>&1 ||
  die "Claude Code não encontrado. Instale primeiro: https://claude.com/claude-code"

if ! command -v bun >/dev/null 2>&1; then
  say "instalando bun (o MCP server depende dele)"
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  command -v bun >/dev/null 2>&1 || die "bun instalou mas não entrou no PATH — abra um terminal novo e rode de novo"
fi

say "instalando o plugin"
claude plugin marketplace add "$REPO" 2>/dev/null ||
  claude plugin marketplace update "$MARKETPLACE" 2>/dev/null ||
  true
claude plugin install "${PLUGIN}@${MARKETPLACE}"

ROOT=$(ls -d "$HOME"/.claude/plugins/cache/"$MARKETPLACE"/"$PLUGIN"/*/ 2>/dev/null | sort -V | tail -1 || true)
[ -n "$ROOT" ] || die "o plugin não apareceu em ~/.claude/plugins/cache/$MARKETPLACE/$PLUGIN"

say "configurando"
# Sob `curl | bash` o stdin é o pipe do script, e sem um TTY o sudo não consegue
# ler a senha — /dev/tty devolve o terminal real ao setup.
if [ -e /dev/tty ]; then
  CLAUDE_PLUGIN_ROOT="$ROOT" bun "$ROOT/scripts/setup.ts" < /dev/tty
else
  CLAUDE_PLUGIN_ROOT="$ROOT" bun "$ROOT/scripts/setup.ts"
fi
