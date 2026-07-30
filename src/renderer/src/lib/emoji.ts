import emojiData from 'emojibase-data/en/compact.json'
import type { CompactEmoji } from 'emojibase'

export interface EmojiCategory {
  key: string
  label: string
  /** Emojibase group numbers that feed this category. */
  groups: number[]
}

/**
 * Emojibase's ten groups, collapsed to the eight categories a picker shows:
 * "smileys & emotion" and "people & body" read as one section to anyone who
 * isn't a Unicode editor, and the "component" group (bare skin-tone and hair
 * modifiers) isn't pickable on its own at all.
 */
export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { key: 'people', label: 'People', groups: [0, 1] },
  { key: 'nature', label: 'Nature', groups: [3] },
  { key: 'food', label: 'Food & Drink', groups: [4] },
  { key: 'activity', label: 'Activity', groups: [6] },
  { key: 'travel', label: 'Travel & Places', groups: [5] },
  { key: 'objects', label: 'Objects', groups: [7] },
  { key: 'symbols', label: 'Symbols', groups: [8] },
  { key: 'flags', label: 'Flags', groups: [9] }
]

export interface EmojiEntry {
  /** Default (yellow) presentation. */
  unicode: string
  label: string
  /** Everything the filter matches against, lowercased and pre-joined. */
  search: string
  /** Tone 1-5 → the toned variant, where the emoji supports it. */
  tones: string[] | null
}

const SKIN_TONE_MODIFIERS = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF']

/** Number of selectable tones, plus the default: matches the picker's swatches. */
export const SKIN_TONE_COUNT = SKIN_TONE_MODIFIERS.length + 1

/** A preview swatch per tone — the raised hand, which every tone supports. */
export const SKIN_TONE_SWATCHES = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿']

/**
 * Picks the single-tone variants of an emoji, in tone order.
 *
 * Emoji with two people in them (a handshake, a couple) list every *pair* of
 * tones as a separate skin — 25 of them — so a skin is only taken when exactly
 * one modifier appears in its hexcode, which is what "this emoji, in one tone"
 * means. Emoji whose skins are all pairs simply end up with no tones.
 */
function singleToneVariants(emoji: CompactEmoji): string[] | null {
  if (!emoji.skins?.length) return null

  const byTone = new Map<number, string>()
  for (const skin of emoji.skins) {
    const parts = skin.hexcode.split('-')
    const modifiers = parts.filter((part) => SKIN_TONE_MODIFIERS.includes(part))
    if (modifiers.length !== 1) continue
    byTone.set(SKIN_TONE_MODIFIERS.indexOf(modifiers[0]) + 1, skin.unicode)
  }

  if (byTone.size === 0) return null
  return SKIN_TONE_MODIFIERS.map((_, index) => byTone.get(index + 1) ?? emoji.unicode)
}

function toEntry(emoji: CompactEmoji): EmojiEntry {
  return {
    unicode: emoji.unicode,
    label: emoji.label,
    search: [emoji.label, ...(emoji.tags ?? [])].join(' ').toLowerCase(),
    tones: singleToneVariants(emoji)
  }
}

/** Every pickable emoji, bucketed by category and left in Unicode's own order. */
export const EMOJI_BY_CATEGORY: Record<string, EmojiEntry[]> = Object.fromEntries(
  EMOJI_CATEGORIES.map((category) => [
    category.key,
    (emojiData as CompactEmoji[])
      .filter((emoji) => emoji.group !== undefined && category.groups.includes(emoji.group))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(toEntry)
  ])
)

const ALL_EMOJI = EMOJI_CATEGORIES.flatMap((category) => EMOJI_BY_CATEGORY[category.key])

/** The emoji as it should be inserted, honouring the chosen skin tone. */
export function withSkinTone(emoji: EmojiEntry, tone: number): string {
  if (tone <= 0 || !emoji.tones) return emoji.unicode
  return emoji.tones[tone - 1] ?? emoji.unicode
}

export function searchEmoji(query: string): EmojiEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const terms = needle.split(/\s+/)
  return ALL_EMOJI.filter((emoji) => terms.every((term) => emoji.search.includes(term)))
}

export function randomEmoji(): EmojiEntry {
  return ALL_EMOJI[Math.floor(Math.random() * ALL_EMOJI.length)]
}
