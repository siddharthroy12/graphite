/**
 * A small, dependency-free grammar checker. It runs entirely on-device — no
 * text ever leaves the machine — so it deliberately trades breadth for
 * precision: every rule here is one that produces a confident, single-choice
 * fix, because a grammar underline that suggests the wrong change is worse than
 * one that stays quiet. Each match is an offset range within a single text run
 * plus the text to swap in.
 */

export interface GrammarMatch {
  /** Start offset within the checked string. */
  from: number
  /** End offset (exclusive). */
  to: number
  /** Short human-readable reason, shown in the suggestion popup. */
  message: string
  /** The text to replace [from, to) with. */
  replacement: string
}

/** Restores the capitalisation of `original` onto a lowercase `word`. */
function matchCase(word: string, original: string): string {
  return /^[A-Z]/.test(original) ? word.charAt(0).toUpperCase() + word.slice(1) : word
}

/**
 * Whether the article before `word` should be "an" (true) or "a" (false), or
 * `null` when the word is too ambiguous to call (silent-h, "u"/"eu" words,
 * abbreviations). Kept conservative on purpose.
 */
function wantsAn(word: string): boolean | null {
  const w = word.toLowerCase()
  // "one"/"once" open with a "w" sound, so they take "a".
  if (/^once?\b/.test(w) || w === 'one') return false
  if (/^[aei]/.test(w)) return true
  if (/^o/.test(w)) return true
  // b–z minus the genuinely ambiguous leads (h silent, u/eu "yoo", x "eks").
  if (/^[bcdfgjklmnpqrstvwyz]/.test(w)) return false
  return null
}

type Rule = (text: string, out: GrammarMatch[]) => void

const repeatedWord: Rule = (text, out) => {
  // A word immediately repeated, e.g. "the the" -> "the". Two letters or more,
  // to skip legitimate short repeats and stray initials.
  const re = /\b([A-Za-z]{2,})(\s+)\1\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    out.push({
      from: m.index,
      to: m.index + m[0].length,
      message: 'Repeated word',
      replacement: m[1]
    })
  }
}

const article: Rule = (text, out) => {
  const re = /\b(an?)(\s+)([A-Za-z]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const [, art, , word] = m
    const isAn = art.toLowerCase() === 'an'
    const want = wantsAn(word)
    if (want === null || want === isAn) continue
    out.push({
      from: m.index,
      to: m.index + art.length,
      message: `Use "${matchCase(want ? 'an' : 'a', art)}" before "${word}"`,
      replacement: matchCase(want ? 'an' : 'a', art)
    })
  }
}

const lowercaseI: Rule = (text, out) => {
  // The pronoun "I" written lowercase. Bounded by non-letters so it won't touch
  // "i" inside a word; the apostrophe forms ("i'm", "i'll") still match.
  const re = /(^|[^A-Za-z'])i(?=$|[^A-Za-z])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const at = m.index + m[1].length
    out.push({ from: at, to: at + 1, message: 'Capitalize "I"', replacement: 'I' })
  }
}

const doubleSpace: Rule = (text, out) => {
  const re = / {2,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    out.push({
      from: m.index,
      to: m.index + m[0].length,
      message: 'Extra space',
      replacement: ' '
    })
  }
}

const spaceBeforePunctuation: Rule = (text, out) => {
  const re = / +([,.!?;:])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    out.push({
      from: m.index,
      to: m.index + m[0].length,
      message: 'Space before punctuation',
      replacement: m[1]
    })
  }
}

const RULES: Rule[] = [repeatedWord, article, lowercaseI, doubleSpace, spaceBeforePunctuation]

/** Every grammar issue found in one text run, sorted by position. */
export function checkText(text: string): GrammarMatch[] {
  const out: GrammarMatch[] = []
  for (const rule of RULES) rule(text, out)
  return out.sort((a, b) => a.from - b.from)
}
