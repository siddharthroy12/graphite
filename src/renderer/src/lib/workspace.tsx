import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { MovePageInput, Page, PageTreeNode, ThemePreference } from '@shared/types'
import { ancestorIds, findNode } from './tree'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/** An open tab, with its own back/forward history of page ids. */
export interface Tab {
  id: string
  pageId: string | null
  history: string[]
  /** Index into `history`; -1 for an empty tab. */
  historyIndex: number
}

interface WorkspaceValue {
  tree: PageTreeNode[]
  currentPage: Page | null
  currentPageId: string | null
  loading: boolean
  saveState: SaveState
  expandedIds: Set<string>
  theme: ThemePreference
  resolvedTheme: 'light' | 'dark'
  sidebarOpen: boolean
  sidebarWidth: number

  tabs: Tab[]
  activeTabId: string | null
  canGoBack: boolean
  canGoForward: boolean

  openPage(id: string): void
  openPageInNewTab(id: string): void
  newTab(): void
  closeTab(tabId: string): void
  selectTab(tabId: string): void
  cycleTab(delta: number): void
  moveTab(tabId: string, toIndex: number): void
  goBack(): void
  goForward(): void

  createPage(parentId?: string | null): Promise<string | null>
  deletePage(id: string): Promise<void>
  restorePage(id: string): Promise<void>
  permanentlyDeletePage(id: string): Promise<void>
  duplicatePage(id: string): Promise<void>
  renamePage(id: string, title: string): void
  setPageIcon(id: string, icon: string | null): Promise<void>
  setPageFont(id: string, font: string): void
  setPageCover(id: string, cover: string | null): Promise<void>
  setPageCoverPosition(id: string, position: number): Promise<void>
  toggleFavorite(id: string): Promise<void>
  movePage(input: MovePageInput): Promise<void>
  /** Called by the editor on every change; persists after a short pause. */
  updateContent(id: string, content: string, plainText: string): void
  /** Forces any pending edit to disk. */
  flush(): Promise<void>

  toggleExpanded(id: string): void
  setExpanded(id: string, expanded: boolean): void
  setTheme(theme: ThemePreference): void
  setSidebarOpen(open: boolean): void
  setSidebarWidth(width: number): void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

const SAVE_DEBOUNCE_MS = 600

/**
 * The sidebar's content needs real room: a depth-2 tree row's icon, chevron,
 * and hover-revealed buttons alone take ~144px before a single character of
 * title, and the search row's icon/label/⌘K shortcut can't shrink at all.
 * Measured via the browser's own `min-content` sizing against this app's
 * actual default pages, the sidebar wants ~257px before anything would need
 * to truncate — which is why the minimum matches DEFAULT_SIDEBAR_WIDTH rather
 * than being independently chosen.
 */
export const DEFAULT_SIDEBAR_WIDTH = 260
const MIN_SIDEBAR_WIDTH = DEFAULT_SIDEBAR_WIDTH
const MAX_SIDEBAR_WIDTH = 460

interface PendingEdit {
  title?: string
  content?: string
  plainText?: string
}

function createTab(pageId: string | null): Tab {
  return {
    id: crypto.randomUUID(),
    pageId,
    history: pageId ? [pageId] : [],
    historyIndex: pageId ? 0 : -1
  }
}

/** Pushes `pageId` onto the tab's history, discarding any forward entries. */
function navigateTab(tab: Tab, pageId: string): Tab {
  if (tab.pageId === pageId) return tab
  const history = [...tab.history.slice(0, tab.historyIndex + 1), pageId]
  return { ...tab, pageId, history, historyIndex: history.length - 1 }
}

export function WorkspaceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [tree, setTree] = useState<PageTreeNode[]>([])
  const [currentPage, setCurrentPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [theme, setThemeState] = useState<ThemePreference>('system')
  const [systemDark, setSystemDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidthState] = useState(DEFAULT_SIDEBAR_WIDTH)

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const pending = useRef(new Map<string, PendingEdit>())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  )
  // The active tab is the single source of truth for what's on screen.
  const currentPageId = activeTab?.pageId ?? null

  const refreshTree = useCallback(async () => {
    setTree(await window.api.pages.tree())
  }, [])

  /* ---------------------------------------------------------------------- */
  /* Saving                                                                 */
  /* ---------------------------------------------------------------------- */

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (pending.current.size === 0) return

    const edits = [...pending.current.entries()]
    pending.current.clear()
    setSaveState('saving')

    try {
      const updated = await Promise.all(
        edits.map(([id, edit]) => window.api.pages.update({ id, ...edit }))
      )

      if (edits.some(([, edit]) => edit.title !== undefined)) {
        await refreshTree()
      }

      const fresh = updated.find((page) => page && page.id === currentPageId)
      if (fresh) {
        setCurrentPage((prev) =>
          prev && prev.id === fresh.id ? { ...prev, updatedAt: fresh.updatedAt } : prev
        )
      }

      setSaveState('saved')
    } catch (error) {
      console.error('Failed to save page', error)
      setSaveState('error')
    }
  }, [currentPageId, refreshTree])

  // `flush` changes identity as the open page changes; a ref keeps effects and
  // handlers from having to re-subscribe.
  const flushRef = useRef(flush)
  flushRef.current = flush

  const queueEdit = useCallback((id: string, edit: PendingEdit) => {
    const existing = pending.current.get(id) ?? {}
    pending.current.set(id, { ...existing, ...edit })
    setSaveState('dirty')

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void flushRef.current()
    }, SAVE_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    const handler = (): void => {
      void flushRef.current()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  /* ---------------------------------------------------------------------- */
  /* Loading the active page                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!currentPageId) {
      setCurrentPage(null)
      return
    }

    let cancelled = false
    void window.api.pages.get(currentPageId).then((page) => {
      if (cancelled) return
      setCurrentPage(page)
      setSaveState('idle')
    })

    return () => {
      cancelled = true
    }
  }, [currentPageId])

  // Reveal the open page in the sidebar.
  useEffect(() => {
    if (!currentPageId || tree.length === 0) return
    setExpandedIds((prev) => {
      const ancestors = ancestorIds(tree, currentPageId)
      if (ancestors.every((id) => prev.has(id))) return prev
      const next = new Set(prev)
      for (const id of ancestors) next.add(id)
      return next
    })
  }, [currentPageId, tree])

  /* ---------------------------------------------------------------------- */
  /* First load                                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const [loadedTree, prefs] = await Promise.all([
        window.api.pages.tree(),
        window.api.prefs.get()
      ])
      if (cancelled) return

      setTree(loadedTree)
      setThemeState(prefs.theme)
      // Clamp on load too, so a width saved before the minimum was raised
      // (or a corrupt/hand-edited value) doesn't restore narrower than the
      // sidebar's content can actually fit.
      setSidebarWidthState(
        Math.max(MIN_SIDEBAR_WIDTH, Math.min(prefs.sidebarWidth, MAX_SIDEBAR_WIDTH))
      )
      setExpandedIds(new Set(prefs.expandedIds))

      // Drop tabs whose page has since been deleted.
      const restored = (prefs.tabs ?? [])
        .filter((tab) => !tab.pageId || findNode(loadedTree, tab.pageId))
        .map<Tab>((tab) => ({
          id: tab.id,
          pageId: tab.pageId,
          history: tab.pageId ? [tab.pageId] : [],
          historyIndex: tab.pageId ? 0 : -1
        }))

      if (restored.length > 0) {
        setTabs(restored)
        const active = restored.find((tab) => tab.id === prefs.activeTabId)
        setActiveTabId((active ?? restored[0]).id)
      } else {
        const fallback =
          (prefs.lastOpenPageId && findNode(loadedTree, prefs.lastOpenPageId)
            ? prefs.lastOpenPageId
            : null) ?? loadedTree[0]?.id ?? null
        const tab = createTab(fallback)
        setTabs([tab])
        setActiveTabId(tab.id)
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Persist the tab strip whenever it changes.
  useEffect(() => {
    if (loading) return
    void window.api.prefs.set({
      tabs: tabs.map((tab) => ({ id: tab.id, pageId: tab.pageId })),
      activeTabId,
      lastOpenPageId: currentPageId
    })
  }, [tabs, activeTabId, currentPageId, loading])

  /* ---------------------------------------------------------------------- */
  /* Tabs                                                                   */
  /* ---------------------------------------------------------------------- */

  const openPage = useCallback(
    (id: string) => {
      if (id === currentPageId) return
      void flushRef.current()
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? navigateTab(tab, id) : tab))
      )
    },
    [activeTabId, currentPageId]
  )

  const openPageInNewTab = useCallback((id: string) => {
    void flushRef.current()
    const tab = createTab(id)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }, [])

  const newTab = useCallback(() => {
    void flushRef.current()
    const tab = createTab(null)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }, [])

  const closeTab = useCallback(
    (tabId: string) => {
      void flushRef.current()
      setTabs((prev) => {
        const index = prev.findIndex((tab) => tab.id === tabId)
        if (index === -1) return prev

        const next = prev.filter((tab) => tab.id !== tabId)
        // Never leave the window with no tab at all.
        if (next.length === 0) {
          const replacement = createTab(null)
          setActiveTabId(replacement.id)
          return [replacement]
        }

        setActiveTabId((current) => {
          if (current !== tabId) return current
          return next[Math.min(index, next.length - 1)].id
        })
        return next
      })
    },
    []
  )

  const selectTab = useCallback((tabId: string) => {
    void flushRef.current()
    setActiveTabId(tabId)
  }, [])

  const cycleTab = useCallback(
    (delta: number) => {
      if (tabs.length < 2) return
      const index = tabs.findIndex((tab) => tab.id === activeTabId)
      if (index === -1) return
      const next = (index + delta + tabs.length) % tabs.length
      selectTab(tabs[next].id)
    },
    [tabs, activeTabId, selectTab]
  )

  const moveTab = useCallback((tabId: string, toIndex: number) => {
    setTabs((prev) => {
      const from = prev.findIndex((tab) => tab.id === tabId)
      if (from === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved)
      return next
    })
  }, [])

  const step = useCallback(
    (delta: number) => {
      void flushRef.current()
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== activeTabId) return tab
          const index = tab.historyIndex + delta
          if (index < 0 || index >= tab.history.length) return tab
          return { ...tab, historyIndex: index, pageId: tab.history[index] }
        })
      )
    },
    [activeTabId]
  )

  const goBack = useCallback(() => step(-1), [step])
  const goForward = useCallback(() => step(1), [step])

  const canGoBack = (activeTab?.historyIndex ?? -1) > 0
  const canGoForward =
    activeTab !== null && activeTab.historyIndex < activeTab.history.length - 1

  /* ---------------------------------------------------------------------- */
  /* Page mutations                                                         */
  /* ---------------------------------------------------------------------- */

  const createPage = useCallback(
    async (parentId: string | null = null): Promise<string | null> => {
      await flushRef.current()
      try {
        const page = await window.api.pages.create({ parentId })
        await refreshTree()

        if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId))

        setTabs((prev) =>
          prev.map((tab) => (tab.id === activeTabId ? navigateTab(tab, page.id) : tab))
        )
        setCurrentPage(page)
        setSaveState('idle')
        return page.id
      } catch (error) {
        console.error('Failed to create page', error)
        return null
      }
    },
    [activeTabId, refreshTree]
  )

  // Drops a set of removed page ids out of every tab: a tab sitting on one of
  // them falls back to an empty tab, and any history entry is pruned so
  // back/forward can't return to a page that no longer exists.
  const dropTabsInto = useCallback((removed: Set<string>) => {
    setTabs((prev) => {
      const next = prev.map((tab) =>
        tab.pageId && removed.has(tab.pageId)
          ? {
              ...tab,
              pageId: null,
              history: tab.history.filter((pageId) => !removed.has(pageId)),
              historyIndex: -1
            }
          : {
              ...tab,
              history: tab.history.filter((pageId) => !removed.has(pageId))
            }
      )
      return next.map((tab) => ({
        ...tab,
        historyIndex: tab.pageId ? tab.history.indexOf(tab.pageId) : -1
      }))
    })
  }, [])

  // Trashing keeps the row but marks it deleted; a tab on it still clears,
  // since a trashed page shouldn't linger on screen unless reopened from trash.
  const deletePage = useCallback(
    async (id: string) => {
      pending.current.delete(id)
      const trashed = new Set(await window.api.pages.trash(id))
      setTree(await window.api.pages.tree())
      dropTabsInto(trashed)
    },
    [dropTabsInto]
  )

  // Restoring a trashed page. If it's currently open (viewed via the trash
  // banner), swap in the restored copy so its `deletedAt` clears and the
  // banner disappears without a reload.
  const restorePage = useCallback(
    async (id: string) => {
      const restored = await window.api.pages.restore(id)
      await refreshTree()
      if (restored) setCurrentPage((prev) => (prev && prev.id === id ? restored : prev))
    },
    [refreshTree]
  )

  const permanentlyDeletePage = useCallback(
    async (id: string) => {
      pending.current.delete(id)
      const removed = new Set(await window.api.pages.permanentlyDelete(id))
      dropTabsInto(removed)
    },
    [dropTabsInto]
  )

  const duplicatePage = useCallback(
    async (id: string) => {
      await flushRef.current()
      const copy = await window.api.pages.duplicate(id)
      await refreshTree()
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? navigateTab(tab, copy.id) : tab))
      )
      setCurrentPage(copy)
    },
    [activeTabId, refreshTree]
  )

  const renamePage = useCallback(
    (id: string, title: string) => {
      setCurrentPage((prev) => (prev && prev.id === id ? { ...prev, title } : prev))
      setTree((prev) => {
        const patch = (nodes: PageTreeNode[]): PageTreeNode[] =>
          nodes.map((node) =>
            node.id === id
              ? { ...node, title, children: patch(node.children) }
              : { ...node, children: patch(node.children) }
          )
        return patch(prev)
      })
      queueEdit(id, { title })
    },
    [queueEdit]
  )

  const setPageIcon = useCallback(
    async (id: string, icon: string | null) => {
      await window.api.pages.update({ id, icon })
      setCurrentPage((prev) => (prev && prev.id === id ? { ...prev, icon } : prev))
      await refreshTree()
    },
    [refreshTree]
  )

  const setPageFont = useCallback((id: string, font: string) => {
    // Font lives only on the open page and the tree doesn't render it, so this
    // updates local state and persists without a tree refresh.
    setCurrentPage((prev) => (prev && prev.id === id ? { ...prev, font } : prev))
    void window.api.pages.update({ id, font })
  }, [])

  const setPageCover = useCallback(
    async (id: string, cover: string | null) => {
      // A new cover starts centred; keeping the old offset would show a
      // different slice of a differently-sized image.
      await window.api.pages.update({ id, cover, coverPosition: 0.5 })
      setCurrentPage((prev) =>
        prev && prev.id === id ? { ...prev, cover, coverPosition: 0.5 } : prev
      )
      await refreshTree()
    },
    [refreshTree]
  )

  const setPageCoverPosition = useCallback(async (id: string, position: number) => {
    const clamped = Math.min(1, Math.max(0, position))
    await window.api.pages.update({ id, coverPosition: clamped })
    setCurrentPage((prev) => (prev && prev.id === id ? { ...prev, coverPosition: clamped } : prev))
  }, [])

  const toggleFavorite = useCallback(
    async (id: string) => {
      const page = await window.api.pages.get(id)
      if (!page) return
      await window.api.pages.update({ id, favorite: !page.favorite })
      setCurrentPage((prev) =>
        prev && prev.id === id ? { ...prev, favorite: !page.favorite } : prev
      )
      await refreshTree()
    },
    [refreshTree]
  )

  const movePage = useCallback(
    async (input: MovePageInput) => {
      try {
        await window.api.pages.move(input)
        await refreshTree()
        if (input.parentId) {
          setExpandedIds((prev) => new Set(prev).add(input.parentId!))
        }
      } catch (error) {
        console.error('Failed to move page', error)
      }
    },
    [refreshTree]
  )

  const updateContent = useCallback(
    (id: string, content: string, plainText: string) => {
      queueEdit(id, { content, plainText })
    },
    [queueEdit]
  )

  /* ---------------------------------------------------------------------- */
  /* View preferences                                                       */
  /* ---------------------------------------------------------------------- */

  const setExpanded = useCallback((id: string, expanded: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (expanded) next.add(id)
      else next.delete(id)
      void window.api.prefs.set({ expandedIds: [...next] })
      return next
    })
  }, [])

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      void window.api.prefs.set({ expandedIds: [...next] })
      return next
    })
  }, [])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    void window.api.prefs.set({ theme: next })
  }, [])

  const setSidebarWidth = useCallback((width: number) => {
    const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(width, MAX_SIDEBAR_WIDTH))
    setSidebarWidthState(clamped)
    void window.api.prefs.set({ sidebarWidth: clamped })
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(query.matches)
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const value = useMemo<WorkspaceValue>(
    () => ({
      tree,
      currentPage,
      currentPageId,
      loading,
      saveState,
      expandedIds,
      theme,
      resolvedTheme,
      sidebarOpen,
      sidebarWidth,
      tabs,
      activeTabId,
      canGoBack,
      canGoForward,
      openPage,
      openPageInNewTab,
      newTab,
      closeTab,
      selectTab,
      cycleTab,
      moveTab,
      goBack,
      goForward,
      createPage,
      deletePage,
      restorePage,
      permanentlyDeletePage,
      duplicatePage,
      renamePage,
      setPageIcon,
      setPageFont,
      setPageCover,
      setPageCoverPosition,
      toggleFavorite,
      movePage,
      updateContent,
      flush,
      toggleExpanded,
      setExpanded,
      setTheme,
      setSidebarOpen,
      setSidebarWidth
    }),
    [
      tree,
      currentPage,
      currentPageId,
      loading,
      saveState,
      expandedIds,
      theme,
      resolvedTheme,
      sidebarOpen,
      sidebarWidth,
      tabs,
      activeTabId,
      canGoBack,
      canGoForward,
      openPage,
      openPageInNewTab,
      newTab,
      closeTab,
      selectTab,
      cycleTab,
      moveTab,
      goBack,
      goForward,
      createPage,
      deletePage,
      restorePage,
      permanentlyDeletePage,
      duplicatePage,
      renamePage,
      setPageIcon,
      setPageFont,
      setPageCover,
      setPageCoverPosition,
      toggleFavorite,
      movePage,
      updateContent,
      flush,
      toggleExpanded,
      setExpanded,
      setTheme,
      setSidebarWidth
    ]
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used inside a WorkspaceProvider')
  }
  return context
}
