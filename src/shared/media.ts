/**
 * Image, video, audio and file blocks all share one editor node — `media` —
 * distinguished by `kind`. The uploaded bytes are stored the same way page
 * icons are (a `file:` value in the shared uploads directory, served over the
 * icon scheme); the block's other attributes travel in the document itself.
 *
 * Keep this file dependency-free — main, preload and renderer all import it.
 */

export const MEDIA_NODE = 'media'

export type MediaKind = 'image' | 'video' | 'audio' | 'file'

export const MEDIA_KINDS: MediaKind[] = ['image', 'video', 'audio', 'file']

/** `accept` filter for each kind's file picker; `file` takes anything. */
export const MEDIA_ACCEPT: Record<MediaKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  file: ''
}

/** Upper bound on an uploaded file. Everything crosses IPC in one buffer, so
 *  this is deliberately generous but not unbounded. */
export const MEDIA_UPLOAD_MAX_BYTES = 100 * 1024 * 1024

/** A media node's stored attributes. `src` is null until something is uploaded. */
export interface MediaAttrs {
  kind: MediaKind
  /** A `file:<name>` value, or null while the block is still an empty prompt. */
  src: string | null
  /** Original file name, kept for the file card and downloads. */
  name: string | null
  /** Byte size, shown on the file card. */
  size: number | null
}

/** Human-readable file size, e.g. 1.4 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
