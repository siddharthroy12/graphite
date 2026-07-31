import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import {
  ICON_SCHEME,
  ICON_UPLOAD_MAX_BYTES,
  ICON_UPLOAD_TYPES,
  fileIconValue,
  isValidIconFileName,
  parseIcon
} from '../shared/icon'
import { COVER_UPLOAD_MAX_BYTES, parseCover } from '../shared/cover'
import { getDataDir, iconsDirName } from './data-dir'
import { getUsedImages } from './db'

/**
 * Uploaded page images live beside the database, in the app's own data
 * directory. The folder is named for icons because they came first; covers
 * share it, since both are user-supplied images served the same way.
 *
 * Dev uses its own folder: garbage collection deletes files the open
 * database doesn't reference, so sharing one folder would let the dev
 * database collect the packaged app's images (and vice versa).
 */
function iconsDirectory(): string {
  const directory = join(getDataDir(), iconsDirName())
  mkdirSync(directory, { recursive: true })
  return directory
}

/**
 * Must run before `app.whenReady()`: a custom scheme can only be given these
 * privileges during startup. `standard` gives the scheme a normal origin so
 * `<img>` treats it like any other URL, and `secure` keeps it out of the
 * mixed-content rules that would block it on the app's own page.
 */
export function registerIconScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ICON_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/**
 * Serves uploaded icons to the renderer. The file name is re-validated here
 * rather than trusted from the URL — this handler reads from disk, so it is
 * the last place a `..` could turn into an escape from the icons directory.
 */
export function registerIconProtocol(): void {
  protocol.handle(ICON_SCHEME, (request) => {
    const fileName = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
    if (!isValidIconFileName(fileName)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(join(iconsDirectory(), fileName)).toString())
  })
}

export interface SaveImageInput {
  /** Raw image bytes. */
  data: Uint8Array
  /** MIME type, used to pick the extension — must be one we accept. */
  type: string
  /** What the image is for; only the size limit differs. */
  purpose: 'icon' | 'cover'
}

/** Writes an uploaded image and returns the `file:` value that names it. */
export function saveImageFile({ data, type, purpose }: SaveImageInput): string {
  const extension = ICON_UPLOAD_TYPES[type]
  if (!extension) throw new Error(`Unsupported image type: ${type}`)

  const limit = purpose === 'cover' ? COVER_UPLOAD_MAX_BYTES : ICON_UPLOAD_MAX_BYTES
  const bytes = Buffer.from(data)
  if (bytes.byteLength === 0) throw new Error('Image file is empty')
  if (bytes.byteLength > limit) {
    throw new Error(`Image is larger than ${limit / 1024 / 1024} MB`)
  }

  const fileName = `${randomUUID()}.${extension}`
  writeFileSync(join(iconsDirectory(), fileName), bytes)
  return fileIconValue(fileName)
}

/**
 * Deletes image files no page references any more. Icons and covers are
 * replaced and pages deleted through several different paths, so rather than
 * trying to catch every one of them this runs once at startup and sweeps
 * whatever they left behind.
 */
export function pruneImageFiles(): void {
  try {
    const used = new Set<string>()
    for (const value of getUsedImages()) {
      // A stored value is either an icon or a cover; whichever parser
      // recognises it tells us the file it points at.
      const parsed = parseIcon(value) ?? null
      if (parsed?.kind === 'file') used.add(parsed.file)
      const cover = parseCover(value)
      if (cover?.kind === 'file') used.add(cover.file)
    }

    for (const fileName of readdirSync(iconsDirectory())) {
      if (!used.has(fileName)) rmSync(join(iconsDirectory(), fileName), { force: true })
    }
  } catch (error) {
    // Housekeeping: a failure here must never keep the app from starting.
    console.error('[icons] prune failed:', error)
  }
}
