import { icons } from 'lucide-react'

/**
 * The whole bundled lucide set. `icons` holds canonical names only — the
 * deprecated aliases the package also exports are not in here, so the picker
 * never shows the same glyph twice under two names.
 */
export const LUCIDE_ICON_NAMES = Object.keys(icons).sort()

/** `CircleAlert` → `circle alert`, so a search for "alert" finds it. */
function searchable(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
}

const SEARCH_INDEX = new Map(LUCIDE_ICON_NAMES.map((name) => [name, searchable(name)]))

/** A readable label for the icon's tooltip. */
export function lucideLabel(name: string): string {
  return SEARCH_INDEX.get(name) ?? name
}

export function searchLucideIcons(query: string): string[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return LUCIDE_ICON_NAMES
  const terms = needle.split(/\s+/)
  return LUCIDE_ICON_NAMES.filter((name) => {
    const haystack = SEARCH_INDEX.get(name)!
    return terms.every((term) => haystack.includes(term))
  })
}

export function randomLucideIcon(): string {
  return LUCIDE_ICON_NAMES[Math.floor(Math.random() * LUCIDE_ICON_NAMES.length)]
}
