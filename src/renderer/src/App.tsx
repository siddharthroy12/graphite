import { useCallback, useEffect, useState } from 'react'
import type { PageTreeNode } from '@shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DEFAULT_SIDEBAR_WIDTH, useWorkspace } from '@/lib/workspace'
import { Sidebar } from './components/Sidebar'
import { PageView } from './components/PageView'
import { TabBar } from './components/TabBar'
import { SearchDialog } from './components/SearchDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { DeleteDialog } from './components/DeleteDialog'

export function App(): React.JSX.Element {
  const {
    loading,
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    createPage,
    deletePage,
    currentPageId,
    setTheme,
    resolvedTheme,
    newTab,
    closeTab,
    cycleTab,
    activeTabId,
    goBack,
    goForward
  } = useWorkspace()

  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PageTreeNode | null>(null)
  const [resizing, setResizing] = useState(false)

  /* ---------------------------------------------------------------------- */
  /* Commands                                                               */
  /* ---------------------------------------------------------------------- */

  const runCommand = useCallback(
    (command: string) => {
      switch (command) {
        case 'search':
          setSearchOpen((open) => !open)
          break
        case 'settings':
          setSettingsOpen(true)
          break
        case 'new-page':
          void createPage(null)
          break
        case 'new-subpage':
          void createPage(currentPageId)
          break
        case 'toggle-sidebar':
          setSidebarOpen(!sidebarOpen)
          break
        case 'toggle-theme':
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
          break
        case 'new-tab':
          newTab()
          break
        case 'close-tab':
          if (activeTabId) closeTab(activeTabId)
          break
        case 'next-tab':
          cycleTab(1)
          break
        case 'prev-tab':
          cycleTab(-1)
          break
        case 'go-back':
          goBack()
          break
        case 'go-forward':
          goForward()
          break
      }
    },
    [
      activeTabId,
      closeTab,
      createPage,
      currentPageId,
      cycleTab,
      goBack,
      goForward,
      newTab,
      resolvedTheme,
      setSidebarOpen,
      setTheme,
      sidebarOpen
    ]
  )

  // The native menu owns the accelerators; this covers focus states the menu
  // doesn't reach and keeps shortcuts working if the menu is unavailable.
  useEffect(() => window.onMenuCommand(runCommand), [runCommand])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  /* ---------------------------------------------------------------------- */
  /* Sidebar resizing                                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!resizing) return

    const onMove = (event: MouseEvent): void => setSidebarWidth(event.clientX)
    const onUp = (): void => setResizing(false)

    // Suppress text selection while the divider is being dragged.
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resizing, setSidebarWidth])

  const handleDelete = useCallback(
    (id: string) => {
      setPendingDelete(null)
      void deletePage(id)
    },
    [deletePage]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Opening your workspace…
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full w-full overflow-hidden">
        {sidebarOpen && (
          <div
            className="relative flex-none"
            style={{ width: `${sidebarWidth}px` }}
          >
            <Sidebar
              onOpenSearch={() => setSearchOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onRequestDelete={setPendingDelete}
            />
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => setResizing(true)}
              onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
              className={cn(
                'absolute inset-y-0 -right-1 w-2 cursor-col-resize',
                resizing && 'bg-ring/30'
              )}
            />
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar onRequestDelete={setPendingDelete} />
          <div className="min-h-0 flex-1">
            <PageView />
          </div>
        </main>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <DeleteDialog
        node={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </TooltipProvider>
  )
}
