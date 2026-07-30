import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreatePageInput,
  MovePageInput,
  Preferences,
  UpdatePageInput
} from '../shared/types'

/**
 * The only surface the renderer gets. Every method is a thin, explicitly named
 * wrapper around one IPC channel — the renderer can never reach `ipcRenderer`
 * or Node directly.
 */
const api = {
  pages: {
    tree: () => ipcRenderer.invoke('pages:tree'),
    get: (id: string) => ipcRenderer.invoke('pages:get', id),
    create: (input: CreatePageInput) => ipcRenderer.invoke('pages:create', input),
    update: (input: UpdatePageInput) => ipcRenderer.invoke('pages:update', input),
    remove: (id: string) => ipcRenderer.invoke('pages:delete', id),
    duplicate: (id: string) => ipcRenderer.invoke('pages:duplicate', id),
    move: (input: MovePageInput) => ipcRenderer.invoke('pages:move', input),
    search: (query: string) => ipcRenderer.invoke('pages:search', query),
    recent: (limit?: number) => ipcRenderer.invoke('pages:recent', limit),
    breadcrumb: (id: string) => ipcRenderer.invoke('pages:breadcrumb', id)
  },
  images: {
    /** Stores an uploaded image and resolves to the `file:` value naming it. */
    upload: (data: Uint8Array, type: string, purpose: 'icon' | 'cover') =>
      ipcRenderer.invoke('images:upload', { data, type, purpose })
  },
  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    set: (patch: Partial<Preferences>) => ipcRenderer.invoke('prefs:set', patch)
  },
  system: {
    dataPath: () => ipcRenderer.invoke('system:dataPath'),
    revealData: () => ipcRenderer.invoke('system:revealData'),
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
    platform: process.platform
  }
}

/** Subscribes to menu-driven commands. Returns an unsubscribe function. */
const onMenuCommand = (listener: (command: string) => void): (() => void) => {
  const handler = (_event: unknown, command: string): void => listener(command)
  ipcRenderer.on('menu:command', handler)
  return () => {
    ipcRenderer.off('menu:command', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('onMenuCommand', onMenuCommand)
