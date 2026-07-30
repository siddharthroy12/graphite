import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, PanelLeft, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { displayTitle, findNode } from '@/lib/tree'
import { useWorkspace, type Tab } from '@/lib/workspace'
import { PageIcon } from './PageIcon'
import type { PageTreeNode } from '@shared/types'

export const TAB_DRAG_TYPE = 'application/x-graphite-tab'

const SAVE_LABELS: Record<string, string> = {
  dirty: 'Unsaved',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
  idle: ''
}

export function TabBar(): React.JSX.Element {
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
    saveState
  } = useWorkspace()

  const isMac = window.api.system.platform === 'darwin'

  return (
    <div
      className={cn(
        // The bar's bottom line is painted as a *background* (a 1px gradient
        // stop at the bottom edge), not as border-b. A border would shrink
        // this box's content area to 43px, so the h-11 tabs inside would end
        // a pixel above the line and could never cover it — and they can't
        // overflow to reach it either, since the horizontally-scrolling row
        // they live in clips them (overflow-x: auto forces overflow-y to
        // compute as auto too, unavoidable per the CSS overflow spec). As a
        // background it sits at the very bottom of a full-height content box,
        // and the active tab's own bg-background — painted after its
        // ancestors' and reaching its own natural edge — simply covers it.
        //
        // It also has to live here on the whole bar rather than on each
        // segment: segments are sized to their content, so the bar's own
        // padding (pl-2/pr-2, and the wider traffic-light inset) would be
        // left without a line at either end.
        'app-drag flex h-11 flex-none items-center gap-1 bg-sidebar bg-[linear-gradient(to_top,var(--border)_1px,transparent_1px)] pr-2 pl-2',
        // Clear the traffic lights when the sidebar isn't there to hold them.
        isMac && !sidebarOpen && 'pl-[78px]'
      )}
    >
      <div className="app-no-drag flex h-11 flex-none items-center gap-0.5">
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
      <div className="app-drag flex h-11 min-w-0 flex-1 items-center">
        <div className="app-no-drag scrollbar-none flex h-11 min-w-0 items-center overflow-x-auto">
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

      <div className="app-no-drag flex h-11 flex-none items-center gap-1">
        <span
          className={cn(
            'text-xs whitespace-nowrap',
            saveState === 'error' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {SAVE_LABELS[saveState]}
        </span>

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
        // Every tab draws both side borders, active or not. The -ml-px on all
        // but the first pulls each tab onto its neighbour's right border so
        // the pair renders as one 1px line rather than a 2px seam; the outer
        // edges of the strip keep their single border. The border's width and
        // colour are the same in both states, so nothing about a tab's box
        // changes when it becomes active — no icon/label shift, no sideways
        // shove of the tabs to its right.
        'group relative flex h-11 max-w-[13rem] min-w-0 flex-none cursor-default items-center gap-1.5 rounded-none border-x border-border pr-2 pl-3 text-sm select-none',
        index > 0 && '-ml-px',
        active
          ? // The page surface's own colour, so it reads as one continuous
            // surface flowing from the tab into the content below it.
            //
            // No relative/absolute offset here, even though the tab's own
            // edge can land a sub-pixel short of the border in testing
            // (43.5px vs a 44px line): the *tab* is still a child of the
            // horizontally-scrolling row, which forces overflow-y to auto
            // right along with overflow-x (unavoidable per the CSS overflow
            // spec) — any offset that pushes this element past the row's own
            // rendered height gets clipped, confirmed by measurement, the
            // same failure mode as the original covering span. It's the
            // border's new home (the row's parent) that isn't clipped, not
            // this element.
            'bg-background text-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/50'
      )}
    >

      {dropSide === 'left' && (
        <span className="pointer-events-none absolute inset-y-1 -left-0.5 w-0.5 rounded-full bg-ring" />
      )}
      {dropSide === 'right' && (
        <span className="pointer-events-none absolute inset-y-1 -right-0.5 w-0.5 rounded-full bg-ring" />
      )}

      <span className="flex size-4 flex-none items-center justify-center text-sm leading-none">
        <PageIcon icon={node?.icon} fallback={<FileText className="size-3.5 opacity-70" />} />
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
