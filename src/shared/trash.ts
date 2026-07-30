/** How long a trashed page survives before it's purged automatically. */
export const TRASH_RETENTION_DAYS = 30
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

/** Whole days left before a page trashed at `deletedAt` is purged. Never negative. */
export function daysUntilPurge(deletedAt: number, now = Date.now()): number {
  const remaining = deletedAt + TRASH_RETENTION_MS - now
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)))
}
