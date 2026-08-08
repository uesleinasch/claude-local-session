#!/usr/bin/env bun
import { readConfig } from '../src/config'
import { toContextPost } from '../src/context-report'
import { HOOK_TIMEOUT_MS } from '../src/protocol'

// Roda no pipeline do statusline: qualquer falha é engolida e a saída é 0
// para nunca atrapalhar o render do statusline do terminal.
try {
  const cfg = readConfig()
  if (cfg) {
    const post = toContextPost(JSON.parse(await Bun.stdin.text()))
    if (post) {
      await fetch(`http://127.0.0.1:${cfg.port}/_context`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ls-token': cfg.token },
        body: JSON.stringify(post),
        signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
      })
    }
  }
} catch {}

process.exit(0)
