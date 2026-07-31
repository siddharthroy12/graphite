import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { app } from 'electron'

/**
 * The workspace — database and uploaded images — lives in one directory. By
 * default that's Electron's per-user data folder, but the user can point it
 * elsewhere (an external drive, a synced folder). This module owns that choice.
 *
 * The chosen directory can't be recorded in the database or preferences —
 * those are the very things being relocated — so it sits in a small JSON file
 * in the *default* userData folder, the one fixed location always reachable.
 *
 * Dev and packaged builds keep separate everything (files, config), so running
 * the dev build never disturbs real data or its location.
 */

export function dbFileName(): string {
  return app.isPackaged ? 'graphite.db' : 'graphite-dev.db'
}

export function iconsDirName(): string {
  return app.isPackaged ? 'page-icons' : 'page-icons-dev'
}

function configFileName(): string {
  return app.isPackaged ? 'graphite-data-location.json' : 'graphite-data-location-dev.json'
}

/** The SQLite WAL/SHM siblings that must travel with the database. */
function workspaceFiles(): string[] {
  return [dbFileName(), `${dbFileName()}-wal`, `${dbFileName()}-shm`]
}

export function defaultDataDir(): string {
  return app.getPath('userData')
}

function configPath(): string {
  return join(defaultDataDir(), configFileName())
}

let cached: string | null = null

function readConfiguredDir(): string | null {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8')) as { dataDir?: unknown }
    if (typeof parsed.dataDir === 'string' && parsed.dataDir) return parsed.dataDir
  } catch {
    // No config yet, or unreadable — fall back to the default.
  }
  return null
}

/** The directory the database and uploaded images currently live in. */
export function getDataDir(): string {
  if (cached) return cached
  const configured = readConfiguredDir()
  // A configured directory that has gone missing (an unplugged drive, say)
  // falls back to the default rather than preventing startup.
  cached = configured && existsSync(configured) ? configured : defaultDataDir()
  return cached
}

export function isDefaultDataDir(): boolean {
  return getDataDir() === defaultDataDir()
}

function writeConfig(dir: string): void {
  if (dir === defaultDataDir()) {
    // Default is the absence of an entry, so a reset leaves no stale path.
    writeFileSync(configPath(), JSON.stringify({}, null, 2))
    cached = defaultDataDir()
  } else {
    writeFileSync(configPath(), JSON.stringify({ dataDir: dir }, null, 2))
    cached = dir
  }
}

/** True when `child` is `parent` itself or nested within it. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))
}

/**
 * Copies the workspace files from one directory to another, then deletes the
 * originals. Copies everything first and only removes originals once every
 * copy has succeeded, so a failure partway leaves the source intact.
 */
function moveWorkspace(from: string, to: string): void {
  mkdirSync(to, { recursive: true })

  const copiedDbFiles: string[] = []
  for (const name of workspaceFiles()) {
    const src = join(from, name)
    if (existsSync(src)) {
      cpSync(src, join(to, name))
      copiedDbFiles.push(src)
    }
  }

  const iconsSrc = join(from, iconsDirName())
  const hasIcons = existsSync(iconsSrc)
  if (hasIcons) cpSync(iconsSrc, join(to, iconsDirName()), { recursive: true })

  // Every copy succeeded; now it's safe to remove the originals.
  for (const src of copiedDbFiles) rmSync(src, { force: true })
  if (hasIcons) rmSync(iconsSrc, { recursive: true, force: true })
}

/**
 * Points the workspace at `target`. The caller must have closed the database
 * first and must reopen it afterwards. If `target` already holds a workspace
 * it's adopted in place; otherwise the current workspace is moved into it.
 *
 * The database being closed, this is a synchronous filesystem operation: on
 * failure it throws with the original data untouched and the location
 * unchanged, so the caller can just reopen where it was.
 */
export function relocateDataDir(target: string): void {
  const current = getDataDir()
  if (target === current) return

  if (isInside(current, target) || isInside(target, current)) {
    throw new Error('Choose a folder that is not inside the current data folder.')
  }

  const targetHasWorkspace = existsSync(join(target, dbFileName()))
  if (!targetHasWorkspace) moveWorkspace(current, target)
  writeConfig(target)
}

/** Moves the workspace back to the default location. */
export function resetDataDir(): void {
  relocateDataDir(defaultDataDir())
}
