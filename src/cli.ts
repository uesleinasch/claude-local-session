#!/usr/bin/env bun
import { parseCommand, usage } from './cli-core'

// Import dinâmico por caso: cada módulo destes faz trabalho já no topo (lê o
// config, abre o histórico, conecta no hub), e um import estático o faria em
// todo subcomando. `bun build --compile` embute os quatro assim mesmo, porque
// os caminhos são literais.
const cmd = parseCommand(process.argv.slice(2))

if (cmd === null) {
  const pedido = process.argv[2]
  const ajuda = pedido === undefined || pedido === '--help' || pedido === '-h' || pedido === 'help'
  process[ajuda ? 'stdout' : 'stderr'].write(usage())
  process.exit(ajuda ? 0 : 1)
}

switch (cmd) {
  case 'hub': {
    const { main } = await import('./hub')
    main()
    break
  }
  case 'mcp': {
    const { main } = await import('./server')
    await main()
    break
  }
  case 'hook': {
    const { main } = await import('../hooks/report')
    await main()
    break
  }
  case 'context-hook': {
    const { main } = await import('../hooks/context-report')
    await main()
    break
  }
  case 'setup': {
    const { main } = await import('../scripts/setup')
    await main()
    break
  }
  case 'service': {
    const { runService, serviceMode } = await import('../scripts/service')
    const { isStandalone, pluginRoot } = await import('./cli-core')
    runService(
      serviceMode(process.argv.slice(3)),
      pluginRoot({
        standalone: isStandalone(Bun.main),
        moduleDir: import.meta.dir,
        execPath: process.execPath,
        env: process.env.LOCAL_SESSION_ROOT,
      }),
    )
    break
  }
}
