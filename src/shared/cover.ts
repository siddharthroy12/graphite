/**
 * A page's `cover` is a single string, in the same spirit as its `icon`:
 *
 *   `gradient:dusk`   one of the built-in presets below
 *   `file:<name>`     an image the user uploaded, stored alongside icon uploads
 *
 * Anything unrecognised is treated as "no cover" rather than rendered blindly.
 *
 * Keep this file dependency-free — main, preload and renderer all import it.
 */

import { FILE_ICON_PREFIX, isValidIconFileName } from './icon'

export const GRADIENT_COVER_PREFIX = 'gradient:'

/**
 * Preset covers, as CSS `background-image` values. They are gradients rather
 * than bundled photographs so the app keeps shipping no image assets, and they
 * look the same in both themes.
 */
export const GRADIENT_COVERS: Record<string, string> = {
  dusk: 'linear-gradient(135deg, #2b3a67 0%, #7b4397 55%, #dc2430 100%)',
  ocean: 'linear-gradient(135deg, #1a2980 0%, #26d0ce 100%)',
  forest: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  sand: 'linear-gradient(135deg, #d1913c 0%, #ffd194 100%)',
  blossom: 'linear-gradient(135deg, #c94b7b 0%, #f7b7a3 100%)',
  slate: 'linear-gradient(135deg, #232526 0%, #6b7a8f 100%)',
  citrus: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
  violet: 'linear-gradient(135deg, #654ea3 0%, #eaafc8 100%)',
  mint: 'linear-gradient(135deg, #0f9b8e 0%, #b5f8c8 100%)',
  ember: 'linear-gradient(135deg, #6d0019 0%, #f85032 100%)'
}

export type ParsedCover =
  | { kind: 'gradient'; name: string; css: string }
  | { kind: 'file'; file: string }

export function parseCover(cover: string | null | undefined): ParsedCover | null {
  if (!cover) return null

  if (cover.startsWith(GRADIENT_COVER_PREFIX)) {
    const name = cover.slice(GRADIENT_COVER_PREFIX.length)
    const css = GRADIENT_COVERS[name]
    return css ? { kind: 'gradient', name, css } : null
  }

  if (cover.startsWith(FILE_ICON_PREFIX)) {
    const file = cover.slice(FILE_ICON_PREFIX.length)
    return isValidIconFileName(file) ? { kind: 'file', file } : null
  }

  return null
}

export function gradientCoverValue(name: string): string {
  return `${GRADIENT_COVER_PREFIX}${name}`
}

/** Covers are displayed far larger than icons, so they get a larger budget. */
export const COVER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024

/** Height of the banner, in pixels. Shared so drag-to-reposition can do maths. */
export const COVER_HEIGHT = 200
