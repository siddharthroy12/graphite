import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Star,
  Trash2,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { displayTitle, findNode } from '@/lib/tree'
import { useWorkspace, type Tab } from '@/lib/workspace'
import type { PageTreeNode } from '@shared/types'

export const TAB_DRAG_TYPE = 'application/x-graphite-tab'

const SAVE_LABELS: Record<string, string> = {
  dirty: 'Unsaved',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
  idle: ''
}

interface TabBarProps {
  onRequestDelete(node: PageTreeNode): void
}

export function TabBar({ onRequestDelete }: TabBarProps): React.JSX.Element {
  const {
    tabs,
    activeTabId,
    selectTab,
    closeTab,
    newTab,
    moveTab,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    sidebarOpen,
    setSidebarOpen,
    tree,
    currentPage,
    saveState,
    toggleFavorite,
    duplicatePage,
    createPage
  } = useWorkspace()

  const isMac = window.api.system.platform === 'darwin'

  return (
    <div
      className={cn(
        'app-drag flex h-11 flex-none items-center gap-1 border-b bg-sidebar pr-2 pl-2',
        // Clear the traffic lights when the sidebar isn't there to hold them.
        isMac && !sidebarOpen && 'pl-[78px]'
      )}
    >
      <div className="app-no-drag flex flex-none items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title={sidebarOpen ? 'Hide sidebar (⌘B)' : 'Show sidebar (⌘B)'}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <PanelLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!canGoBack}
          title="Back (⌘[)"
          aria-label="Back"
          onClick={goBack}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!canGoForward}
          title="Forward (⌘])"
          aria-label="Forward"
          onClick={goForward}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Outer stays draggable: with few tabs there's real empty bar space here
          that should behave like the rest of the tab bar, not like a tab.
          Only the inner row — sized to its actual content — opts out, so the
          tabs and the + button stay clickable and draggable individually. */}
      <div className="app-drag flex min-w-0 flex-1 items-center gap-1">
        <div className="app-no-drag scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto">
          {tabs.map((tab, index) => (
            <TabItem
              key={tab.id}
              tab={tab}
              index={index}
              active={tab.id === activeTabId}
              node={tab.pageId ? findNode(tree, tab.pageId) : null}
              closable={tabs.length > 1}
              onSelect={() => selectTab(tab.id)}
              onClose={() => closeTab(tab.id)}
              onMove={moveTab}
            />
          ))}

          <Button
            variant="ghost"
            size="icon"
            className="size-7 flex-none"
            title="New tab (⌘T)"
            aria-label="New tab"
            onClick={newTab}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="app-no-drag flex flex-none items-center gap-1">
        <span
          className={cn(
            'text-xs whitespace-nowrap',
            saveState === 'error' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {SAVE_LABELS[saveState]}
        </span>

        {currentPage && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title={currentPage.favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={currentPage.favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => void toggleFavorite(currentPage.id)}
            >
              <Star
                className={cn('size-4', currentPage.favorite && 'fill-current text-amber-500')}
              />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Page options"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => void createPage(currentPage.id)}>
                  <Plus className="size-4" />
                  Add subpage
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void duplicatePage(currentPage.id)}>
                  <Copy className="size-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    const node = findNode(tree, currentPage.id)
                    if (node) onRequestDelete(node)
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete page
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  )
}

interface TabItemProps {
  tab: Tab
  index: number
  active: boolean
  node: PageTreeNode | null
  closable: boolean
  onSelect(): void
  onClose(): void
  onMove(tabId: string, toIndex: number): void
}

function TabItem({
  tab,
  index,
  active,
  node,
  closable,
  onSelect,
  onClose,
  onMove
}: TabItemProps): React.JSX.Element {
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null)

  const title = node ? displayTitle(node.title) : 'New tab'

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(TAB_DRAG_TYPE, tab.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        setDropSide(event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right')
      }}
      onDragLeave={() => setDropSide(null)}
      onDrop={(event) => {
        const draggedId = event.dataTransfer.getData(TAB_DRAG_TYPE)
        const side = dropSide
        setDropSide(null)
        if (!draggedId || draggedId === tab.id || !side) return
        event.preventDefault()
        onMove(draggedId, side === 'left' ? index : index + 1)
      }}
      onClick={onSelect}
      // Middle-click closes, as in a browser.
      onAuxClick={(event) => {
        if (event.button === 1 && closable) {
          event.preventDefault()
          onClose()
        }
      }}
      title={title}
      className={cn(
        'group relative flex h-7 max-w-[13rem] min-w-0 flex-none cursor-default items-center gap-1.5 rounded-md pr-1 pl-2 text-sm select-none',
        // Same tokens as a selected row in the sidebar tree, so the two
        // selection states match by construction rather than by hand.
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/70'
      )}
    >
      {dropSide === 'left' && (
        <span className="pointer-events-none absolute inset-y-1 -left-0.5 w-0.5 rounded-full bg-ring" />
      )}
      {dropSide === 'right' && (
        <span className="pointer-events-none absolute inset-y-1 -right-0.5 w-0.5 rounded-full bg-ring" />
      )}

      <span className="flex size-4 flex-none items-center justify-center text-sm leading-none">
        {node?.icon ?? <FileText className="size-3.5 opacity-70" />}
      </span>

      <span className="min-w-0 flex-1 truncate">{title}</span>

      <button
        type="button"
        aria-label={`Close ${title}`}
        className={cn(
          'flex size-5 flex-none items-center justify-center rounded transition-opacity',
          'hover:bg-accent',
          closable ? 'opacity-0 group-hover:opacity-100' : 'invisible'
        )}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
