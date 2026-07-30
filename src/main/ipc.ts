import { ipcMain, shell } from 'electron'
import type {
  CreatePageInput,
  MovePageInput,
  Preferences,
  UpdatePageInput
} from '../shared/types'
import {
  createPage,
  deletePage,
  duplicatePage,
  getBreadcrumb,
  getDatabasePath,
  getPage,
  getPageTree,
  getPreferences,
  getRecentPages,
  movePage,
  searchPages,
  setPreferences,
  updatePage
} from './db'
import { saveImageFile, type SaveImageInput } from './icons'

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
  handle('pages:delete', (id: string) => deletePage(id))
  handle('pages:duplicate', (id: string) => duplicatePage(id))
  handle('pages:move', (input: MovePageInput) => movePage(input))
  handle('pages:search', (query: string) => searchPages(query))
  handle('pages:recent', (limit?: number) => getRecentPages(limit))
  handle('pages:breadcrumb', (id: string) => getBreadcrumb(id))

  handle('images:upload', (input: SaveImageInput) => saveImageFile(input))

  handle('prefs:get', () => getPreferences())
  handle('prefs:set', (patch: Partial<Preferences>) => setPreferences(patch))

  handle('system:dataPath', () => getDatabasePath())
  handle('system:revealData', () => {
    shell.showItemInFolder(getDatabasePath())
  })
  handle('system:openExternal', async (url: string) => {
    // Only ever hand http(s) links to the OS browser.
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Refusing to open non-web URL: ${parsed.protocol}`)
    }
    await shell.openExternal(parsed.toString())
  })
}
