/**
 * A page's body font, chosen from the page options menu. Stored as a short
 * string on the page so it travels with it like any other attribute.
 */
export type PageFont = 'default' | 'serif' | 'mono'

export const PAGE_FONTS: Array<{ id: PageFont; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' }
]

export const DEFAULT_PAGE_FONT: PageFont = 'default'

export function isPageFont(value: string): value is PageFont {
  return value === 'default' || value === 'serif' || value === 'mono'
}

/**
 * CSS class that sets a page font's family. These are plain classes defined in
 * index.css (not Tailwind `font-*` utilities) — see the note there for why.
 */
export function pageFontClass(font: PageFont): string {
  switch (font) {
    case 'serif':
      return 'page-font-serif'
    case 'mono':
      return 'page-font-mono'
    default:
      return 'page-font-default'
  }
}
