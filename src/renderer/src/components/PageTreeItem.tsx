import { useState } from 'react'
import type { PageTreeNode } from '@shared/types'
import {
  ChevronRight,
  Copy,
  FileText,
  MoreHorizontal,
  Plus,
  SquarePlus,
  Star,
  Trash2
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { displayTitle, PAGE_DRAG_TYPE } from '@/lib/tree'
import { useWorkspace } from '@/lib/workspace'

/** Where a drop would land relative to the hovered row. */
type DropZone = 'before' | 'inside' | 'after'

interface PageTreeItemProps {
  node: PageTreeNode
  depth: number
  /** Ordered sibling ids, needed to compute a drop index. */
  siblings: string[]
  onRequestDelete(node: PageTreeNode): void
}

export function PageTreeItem({
  node,
  depth,
  siblings,
  onRequestDelete
}: PageTreeItemProps): React.JSX.Element {
  const {
    currentPageId,
    expandedIds,
    toggleExpanded,
    openPage,
    createPage,
    duplicatePage,
    toggleFavorite,
    movePage,
    openPageInNewTab
  } = useWorkspace()

  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const expanded = expandedIds.has(node.id)
  const hasChildren = node.children.length > 0
  const active = currentPageId === node.id

  const zoneFor = (event: React.DragEvent<HTMLDivElement>): DropZone => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const offset = (event.clientY - bounds.top) / bounds.height
    if (offset < 0.25) return 'before'
    if (offset > 0.75) return 'after'
    return 'inside'
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()

    const draggedId = event.dataTransfer.getData(PAGE_DRAG_TYPE)
    const zone = dropZone
    setDropZone(null)

    if (!draggedId || draggedId === node.id || !zone) return

    if (zone === 'inside') {
      await movePage({ id: draggedId, parentId: node.id, index: node.children.length })
      return
    }

    // Removing the dragged item first keeps the target index meaningful.
    const withoutDragged = siblings.filter((id) => id !== draggedId)
    const anchor = withoutDragged.indexOf(node.id)
    const target = zone === 'before' ? anchor : anchor + 1

    await movePage({ id: draggedId, parentId: node.parentId, index: Math.max(0, target) })
  }

  return (
    <div>
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(PAGE_DRAG_TYPE, node.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(event) => {
          // Dragging an editor block over the sidebar must not look droppable.
          if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropZone(zoneFor(event))
        }}
        onDragLeave={() => setDropZone(null)}
        onDrop={(event) => void handleDrop(event)}
        onClick={(event) => {
          // ⌘/Ctrl-click opens in a new tab, as in a browser.
          if (event.metaKey || event.ctrlKey) openPageInNewTab(node.id)
          else openPage(node.id)
        }}
        // Middle-click also opens in a new tab.
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault()
            openPageInNewTab(node.id)
          }
        }}
        className={cn(
          'group relative flex h-7 cursor-default items-center gap-1 rounded-md pr-1 text-sm select-none',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60',
          dropZone === 'inside' && 'ring-1 ring-ring ring-inset'
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {dropZone === 'before' && (
          <span className="pointer-events-none absolute inset-x-1 top-0 h-0.5 rounded-full bg-ring" />
        )}
        {dropZone === 'after' && (
          <span className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-ring" />
        )}

        <button
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className={cn(
            'flex size-5 flex-none items-center justify-center rounded transition-colors hover:bg-sidebar-accent',
            !hasChildren && 'invisible'
          )}
          onClick={(event) => {
            event.stopPropagation()
            toggleExpanded(node.id)
          }}
        >
          <ChevronRight
            className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
          />
        </button>

        <span className="flex size-5 flex-none items-center justify-center text-base leading-none">
          {node.icon ?? <FileText className="size-3.5 text-muted-foreground" />}
        </span>

        <span className="min-w-0 flex-1 truncate">{displayTitle(node.title)}</span>

        {node.favorite && (
          <Star className="size-3 flex-none fill-current text-amber-500" aria-label="Favorite" />
        )}

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Page options"
              className={cn(
                'flex size-5 flex-none items-center justify-center rounded hover:bg-sidebar-accent',
                menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onSelect={() => openPageInNewTab(node.id)}>
              <SquarePlus className="size-4" />
              Open in new tab
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void toggleFavorite(node.id)}>
              <Star className="size-4" />
              {node.favorite ? 'Remove favorite' : 'Add to favorites'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void duplicatePage(node.id)}>
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onRequestDelete(node)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          aria-label="Add a subpage"
          title="Add a subpage"
          className="flex size-5 flex-none items-center justify-center rounded opacity-0 hover:bg-sidebar-accent group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            void createPage(node.id)
          }}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {expanded &&
        node.children.map((child) => (
          <PageTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            siblings={node.children.map((c) => c.id)}
            onRequestDelete={onRequestDelete}
          />
        ))}

      {expanded && !hasChildren && (
        <div
          className="text-xs text-muted-foreground/70 select-none"
          style={{ paddingLeft: `${(depth + 1) * 12 + 28}px` }}
        >
          No pages inside
        </div>
      )}
    </div>
  )
}
