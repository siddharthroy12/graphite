import { join } from 'node:path'
import { app, BrowserWindow, session, shell } from 'electron'
import { closeDatabase, initDatabase, purgeExpiredTrash } from './db'
import { pruneImageFiles, registerIconProtocol, registerIconScheme } from './icons'
import { registerIpcHandlers } from './ipc'
import { buildAppMenu } from './menu'
import { ICON_SCHEME } from '../shared/icon'
import { TRASH_RETENTION_MS } from '../shared/trash'

const isDev = !app.isPackaged

/**
 * Height of the tab bar and the sidebar's matching spacer — Tailwind `h-11`.
 * The traffic lights are centred against it, so if that class changes this
 * must change with it.
 */
const TITLE_BAR_HEIGHT = 44
/** macOS window buttons are 12pt across. */
const TRAFFIC_LIGHT_DIAMETER = 12
/**
 * The offset positions the buttons' hit area, which sits slightly above the
 * visible circles, so pure centring reads as a touch low. Tuned by eye.
 */
const TRAFFIC_LIGHT_NUDGE = 2

/** How often the trash is swept for anything past its retention period. */
const TRASH_SWEEP_INTERVAL_MS = 60 * 60 * 1000

let mainWindow: BrowserWindow | null = null

/**
 * The app never loads remote code or makes network requests, so production gets
 * a `'self'`-only policy. Dev additionally allows the Vite dev server's inline
 * HMR preamble and websocket. `img-src` also allows the icon scheme, which the
 * main process serves uploaded page icons on — those are local files the user
 * chose themselves, not remote content.
 */
function applyContentSecurityPolicy(): void {
  const images = `img-src 'self' data: blob: ${ICON_SCHEME}:`
  const policy = isDev
    ? `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; ${images}; font-src 'self' data:; connect-src 'self' ws: http://localhost:*`
    : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ${images}; font-src 'self' data:; connect-src 'self'`

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Graphite',
    backgroundColor: '#ffffff',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Packaged builds get their icon from electron-builder; macOS always takes
    // it from the bundle. This is only for the dev window on Windows/Linux.
    ...(isDev && process.platform !== 'darwin'
      ? { icon: join(import.meta.dirname, '../../build/icon.png') }
      : {}),
    trafficLightPosition: {
      x: 16,
      y: (TITLE_BAR_HEIGHT - TRAFFIC_LIGHT_DIAMETER) / 2 - TRAFFIC_LIGHT_NUDGE
    },
    webPreferences: {
      // ESM preload; requires the `.mjs` extension and `sandbox: false`.
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  window.on('ready-to-show', () => window.show())

  // Keep navigation inside the app; anything else goes to the user's browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const isDevServer = isDev && url.startsWith(process.env.ELECTRON_RENDERER_URL ?? '\0')
    if (!isDevServer) event.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}

/** Sends a menu/shortcut command to the renderer, which owns the UI state. */
function sendCommand(command: string): void {
  mainWindow?.webContents.send('menu:command', command)
}

// Has to happen before the app is ready — see registerIconScheme.
registerIconScheme()

app.whenReady().then(() => {
  applyContentSecurityPolicy()
  initDatabase()
  registerIconProtocol()
  pruneImageFiles()
  registerIpcHandlers()
  buildAppMenu(sendCommand)

  // Catches anything that expired while the app was closed; the interval
  // below catches it if the app is simply left open past that point.
  purgeExpiredTrash(TRASH_RETENTION_MS)
  setInterval(() => purgeExpiredTrash(TRASH_RETENTION_MS), TRASH_SWEEP_INTERVAL_MS)

  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDatabase()
})
