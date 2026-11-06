/** Ícones do sprite `web/icons.svg`; `scripts/assets-design.ts` o regenera a partir desta lista. */
export const WEB_ICONS: readonly string[] = [
  'add',
  'arrow_back',
  'arrow_upward',
  'attach_file',
  'bolt',
  'check',
  'check_box',
  'check_box_outline_blank',
  'chevron_right',
  'close',
  'computer',
  'content_copy',
  'content_paste',
  'create_new_folder',
  'delete',
  'description',
  'difference',
  'download',
  'error',
  'folder',
  'help',
  'history',
  'keyboard_arrow_down',
  'more_vert',
  'play_arrow',
  'radio_button_checked',
  'radio_button_unchecked',
  'refresh',
  'replay',
  'schedule',
  'search',
  'send',
  'shield_lock',
  'sort',
  'star',
  'star-fill',
  'stop_circle',
  'terminal',
  'tune',
]

export function buildSprite(paths: ReadonlyMap<string, string>): string {
  const symbols = [...paths].map(
    ([nome, d]) => `<symbol id="i-${nome}" viewBox="0 -960 960 960"><path d="${d}"/></symbol>`,
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>\n`
}
