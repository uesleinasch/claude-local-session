/**
 * `import x from './a.css' with { type: 'file' }` devolve o caminho do arquivo
 * — no disco quando se roda do fonte, no fs virtual dentro do binário. O
 * TypeScript não modela o atributo `with`, e `bun-types` declara `*.html` como
 * `HTMLBundle`: sem estas declarações, `src/web-assets.ts` não compila. Um só
 * `*` por padrão é o limite da sintaxe, daí uma linha por arquivo.
 */
declare module '*.css' {
  const path: string
  export default path
}

declare module '*/web/icons.svg' {
  const path: string
  export default path
}

declare module '*.woff2' {
  const path: string
  export default path
}

declare module '*/web/index.html' {
  const path: string
  export default path
}

declare module '*/web/app.js' {
  const path: string
  export default path
}

declare module '*/web/markdown.js' {
  const path: string
  export default path
}

declare module '*/web/browse-core.js' {
  const path: string
  export default path
}

declare module '*/web/connection.js' {
  const path: string
  export default path
}

declare module '*/web/session-status.js' {
  const path: string
  export default path
}

declare module '*/web/terminal-panel.js' {
  const path: string
  export default path
}

declare module '*/vendor/xterm.js' {
  const path: string
  export default path
}

declare module '*/vendor/addon-fit.js' {
  const path: string
  export default path
}
