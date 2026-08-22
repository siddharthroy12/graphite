import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  CreatePageInput,
  DataLocation,
  DataUsage,
  MovePageInput,
  Preferences,
  UpdatePageInput
} from '../shared/types'
import {
  closeDatabase,
  createPage,
  duplicatePage,
  emptyTrash,
  getBreadcrumb,
  getDatabasePath,
  getPage,
  getPageTree,
  getPreferences,
  getRecentPages,
  getTrash,
  initDatabase,
  movePage,
  permanentlyDeletePage,
  restorePage,
  searchPages,
  setPreferences,
  trashPage,
  updatePage
} from './db'
import {
  dbFileName,
  getDataDir,
  iconsDirName,
  isDefaultDataDir,
  relocateDataDir,
  resetDataDir
} from './data-dir'
import {
  pruneImageFiles,
  saveImageFile,
  saveMediaFile,
  type SaveImageInput,
  type SaveMediaInput
} from './icons'

function dataLocation(): DataLocation {
  return { dir: getDataDir(), dbPath: getDatabasePath(), isDefault: isDefaultDataDir() }
}

/** Size of one file, or 0 if it doesn't exist (WAL/SHM come and go). */
function fileSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/** Recursive size of a directory's contents, or 0 if it doesn't exist. */
function dirSize(path: string): number {
  let entries: string[]
  try {
    entries = readdirSync(path)
  } catch {
    return 0
  }
  let total = 0
  for (const name of entries) {
    const full = join(path, name)
    try {
      const stat = statSync(full)
      total += stat.isDirectory() ? dirSize(full) : stat.size
    } catch {
      // A file that vanished mid-scan just doesn't count.
    }
  }
  return total
}

function dataUsage(): DataUsage {
  const dir = getDataDir()
  const database = [dbFileName(), `${dbFileName()}-wal`, `${dbFileName()}-shm`].reduce(
    (sum, name) => sum + fileSize(join(dir, name)),
    0
  )
  const media = dirSize(join(dir, iconsDirName()))
  return { total: database + media, database, media }
}

/**
 * Applies a data-directory change: close the database, move (or adopt) the
 * files, then reopen. On failure the database is reopened where it already
 * was, so the app is never left without one; the error propagates to the
 * renderer. `pruneImageFiles` runs after adopting an existing workspace, in
 * case it carries images no page references.
 */
function switchDataDir(change: () => void): DataLocation {
  closeDatabase()
  try {
    change()
  } finally {
    initDatabase()
  }
  pruneImageFiles()
  return dataLocation()
}

/**
 * Wraps a handler so a thrown database error travels to the renderer as a
 * rejected promise with a readable message instead of an opaque IPC failure.
 */
function handle<Args extends unknown[], Result>(
  channel: string,
  fn: (...args: Args) => Result
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...(args as Args))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ipc] ${channel} failed:`, error)
      throw new Error(message)
    }
  })
}

export function registerIpcHandlers(): void {
  handle('pages:tree', () => getPageTree())
  handle('pages:get', (id: string) => getPage(id))
  handle('pages:create', (input: CreatePageInput) => createPage(input ?? {}))
  handle('pages:update', (input: UpdatePageInput) => updatePage(input))
  handle('pages:trash', (id: string) => trashPage(id))
  handle('pages:duplicate', (id: string) => duplicatePage(id))
  handle('pages:move', (input: MovePageInput) => movePage(input))
  handle('pages:search', (query: string) => searchPages(query))
  handle('pages:recent', (limit?: number) => getRecentPages(limit))
  handle('pages:breadcrumb', (id: string) => getBreadcrumb(id))
  handle('pages:trashList', () => getTrash())
  handle('pages:restore', (id: string) => restorePage(id))
  handle('pages:permanentlyDelete', (id: string) => permanentlyDeletePage(id))
  handle('pages:emptyTrash', () => emptyTrash())

  handle('images:upload', (input: SaveImageInput) => saveImageFile(input))
  handle('media:upload', (input: SaveMediaInput) => saveMediaFile(input))

  handle('prefs:get', () => getPreferences())
  handle('prefs:set', (patch: Partial<Preferences>) => setPreferences(patch))

  handle('system:dataPath', () => getDatabasePath())
  handle('system:dataInfo', () => dataLocation())
  handle('system:dataUsage', () => dataUsage())
  handle('system:revealData', () => {
    shell.showItemInFolder(getDatabasePath())
  })

  handle('system:chooseDataLocation', async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose where Graphite stores its data',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory']
    })

    const target = result.filePaths[0]
    if (result.canceled || !target) return null
    if (target === getDataDir()) return dataLocation()

    return switchDataDir(() => relocateDataDir(target))
  })

  handle('system:resetDataLocation', () => {
    if (isDefaultDataDir()) return dataLocation()
    return switchDataDir(() => resetDataDir())
  })
  handle('system:openExternal', async (url: string) => {
    // Only ever hand http(s) links to the OS browser.
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Refusing to open non-web URL: ${parsed.protocol}`)
    }
    await shell.openExternal(parsed.toString())
  })

  // Window controls for the frameless Windows/Linux chrome. Each acts on the
  // window that sent the request, not just the focused one.
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:maximizeToggle', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle(
    'window:isMaximized',
    (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  )
}
