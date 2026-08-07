#!/usr/bin/env bun
import { readConfig } from '../src/config'
import { toActivityPost } from '../src/hook-event'
import { HOOK_TIMEOUT_MS } from '../src/protocol'

// Hook lento trava a sessão inteira, e um hub fora do ar não pode derrubar o
// trabalho local: qualquer falha aqui é engolida e a saída é sempre 0.
try {
  const cfg = readConfig()
  if (cfg) {
    const post = toActivityPost(JSON.parse(await Bun.stdin.text()))
    if (post) {
      await fetch(`http://127.0.0.1:${cfg.port}/_activity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ls-token': cfg.token },
        body: JSON.stringify(post),
        signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
      })
    }
  }
} catch {}

process.exit(0)
