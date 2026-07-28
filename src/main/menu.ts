import { Menu, app, type MenuItemConstructorOptions } from 'electron'

/**
 * Application menu. Items that change UI state don't act directly — they emit a
 * command the renderer handles, so the menu and the in-app shortcuts share one
 * implementation.
 */
export function buildAppMenu(sendCommand: (command: string) => void): void {
  const isMac = process.platform === 'darwin'

  const macAppMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            {
              label: 'Settings…',
              accelerator: 'CmdOrCtrl+,',
              click: () => sendCommand('settings')
            },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }
      ]
    : []

  const template: MenuItemConstructorOptions[] = [
    ...macAppMenu,
    {
      label: 'File',
      submenu: [
        {
          label: 'New Page',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendCommand('new-page')
        },
        {
          label: 'New Subpage',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendCommand('new-subpage')
        },
        { type: 'separator' },
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendCommand('new-tab')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendCommand('close-tab')
        },
        { type: 'separator' },
        ...(isMac
          ? [
              {
                label: 'Close Window',
                accelerator: 'CmdOrCtrl+Shift+W',
                role: 'close'
              } as MenuItemConstructorOptions
            ]
          : [
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendCommand('settings')
              } as MenuItemConstructorOptions,
              { type: 'separator' } as MenuItemConstructorOptions,
              { role: 'quit' } as MenuItemConstructorOptions
            ])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [{ role: 'pasteAndMatchStyle' } as MenuItemConstructorOptions]
          : []),
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Search Pages…',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendCommand('search')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: () => sendCommand('go-back')
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => sendCommand('go-forward')
        },
        {
          label: 'Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => sendCommand('next-tab')
        },
        {
          label: 'Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => sendCommand('prev-tab')
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendCommand('toggle-sidebar')
        },
        {
          label: 'Toggle Theme',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => sendCommand('toggle-theme')
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as MenuItemConstructorOptions[]))
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
