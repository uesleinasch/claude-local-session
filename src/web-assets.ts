import { join } from 'node:path'
import appJs from '../web/app.js' with { type: 'file' }
import browseCoreJs from '../web/browse-core.js' with { type: 'file' }
import connectionJs from '../web/connection.js' with { type: 'file' }
import indexHtml from '../web/index.html' with { type: 'file' }
import markdownJs from '../web/markdown.js' with { type: 'file' }
import sessionStatusJs from '../web/session-status.js' with { type: 'file' }
import styleCss from '../web/style.css' with { type: 'file' }
import terminalPanelJs from '../web/terminal-panel.js' with { type: 'file' }
import addonFitJs from '../web/vendor/addon-fit.js' with { type: 'file' }
import xtermCss from '../web/vendor/xterm.css' with { type: 'file' }
import xtermJs from '../web/vendor/xterm.js' with { type: 'file' }

/**
 * Todo arquivo servido precisa de um import estático aqui: `bun build --compile`
 * só embute o que enxerga no grafo de módulos, e um caminho montado em runtime
 * vira 404 dentro do binário. Rodando do fonte, cada valor é o caminho real no
 * disco — por isso editar `web/` e recarregar a página continua funcionando.
 * `tests/web-assets.test.ts` reprova arquivo de `web/` que fique de fora.
 */
const EMBEDDED: Record<string, string> = {
  'index.html': indexHtml,
  'app.js': appJs,
  'browse-core.js': browseCoreJs,
  'markdown.js': markdownJs,
  'connection.js': connectionJs,
  'session-status.js': sessionStatusJs,
  'terminal-panel.js': terminalPanelJs,
  'style.css': styleCss,
  'vendor/xterm.js': xtermJs,
  'vendor/addon-fit.js': addonFitJs,
  'vendor/xterm.css': xtermCss,
}

export const EMBEDDED_FILES: readonly string[] = Object.keys(EMBEDDED)

/**
 * `LOCAL_SESSION_WEB_DIR` serve o `web/` de um diretório em vez do embutido —
 * é o escape para mexer na página sem recompilar o binário.
 */
export function assetPath(file: string, dir = process.env.LOCAL_SESSION_WEB_DIR ?? ''): string | null {
  if (dir !== '') return join(dir, file)
  return EMBEDDED[file] ?? null
}
