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
      <div className="app-drag flex min-w-0 flex-1 items-center">
        <div className="app-no-drag scrollbar-none flex min-w-0 items-center overflow-x-auto">
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
            className="ml-1 size-7 flex-none"
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
        // Full bar height and square corners for every tab — not a smaller
        // pill floating inside the bar — so the active tab's background can
        // reach the bar's own edges exactly, top and bottom.
        //
        // `border-x` is unconditional (transparent when inactive) rather than
        // only present on the active tab: a border adds to a fit-content
        // element's own rendered width, so a tab that gains or loses it
        // changes size — which shifts its own icon/label inward or outward,
        // and shoves every tab to its right sideways. Keeping the border's
        // *width* constant at all times and only ever toggling its *colour*
        // means the box's dimensions never change with active state.
        'group relative flex h-11 max-w-[13rem] min-w-0 flex-none cursor-default items-center gap-1.5 rounded-none border-x border-transparent pr-1 pl-2 text-sm select-none',
        active
          ? // The page surface's own colour, so it reads as one continuous
            // surface flowing from the tab into the content below it. Only
            // the active tab's border is actually visible — it marks its
            // edges against the bar, not a divider between every tab pair.
            'border-border bg-background text-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/50'
      )}
    >
      {active && (
        // Covers the tab bar's own border-b for exactly this tab's width,
        // without moving the tab's own box (and so its text/icon) the way
        // shifting the whole element with a relative offset did — that
        // visibly nudged the label down by a pixel every time this tab
        // became active. Generously tall (4px) and centred on the boundary
        // via translate-y, so it fully covers a 1px border regardless of the
        // display's device pixel ratio rather than relying on an exact
        // pixel-for-pixel guess that can leave a sliver showing.
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 translate-y-1/2 bg-background" />
      )}

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
