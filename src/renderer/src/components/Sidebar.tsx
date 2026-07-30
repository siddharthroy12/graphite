import { useMemo, useState } from 'react'
import type { PageTreeNode } from '@shared/types'
import { FileText, Plus, Search, Settings } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { displayTitle, flattenTree, PAGE_DRAG_TYPE } from '@/lib/tree'
import { useWorkspace } from '@/lib/workspace'
import { PageIcon } from './PageIcon'
import { PageTreeItem } from './PageTreeItem'

interface SidebarProps {
  onOpenSearch(): void
  onOpenSettings(): void
  onRequestDelete(node: PageTreeNode): void
}

export function Sidebar({
  onOpenSearch,
  onOpenSettings,
  onRequestDelete
}: SidebarProps): React.JSX.Element {
  const {
    tree,
    createPage,
    movePage,
    openPage,
    currentPageId
  } = useWorkspace()

  const [rootDropActive, setRootDropActive] = useState(false)

  const favorites = useMemo(
    () => flattenTree(tree).filter((node) => node.favorite),
    [tree]
  )

  const rootIds = useMemo(() => tree.map((node) => node.id), [tree])

  const isMac = window.api.system.platform === 'darwin'

  return (
    <aside className="flex h-full flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Space for the macOS traffic lights; also drags the window. Left
          borderless on purpose — a rule here cuts across under the traffic
          lights. The sidebar toggle itself lives in the tab bar. */}
      <div className={cn('app-drag flex-none', isMac ? 'h-11' : 'h-9')} />

      <div className="flex flex-none flex-col gap-0.5 px-2 pt-2 pb-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
        >
          <Search className="size-4" />
          <span>Search</span>
          {isMac ? (
            <span className="ml-auto flex items-center gap-0.5">
              <kbd className="flex size-4 items-center justify-center rounded border text-xs leading-none text-muted-foreground">
                ⌘
              </kbd>
              <kbd className="flex size-4 items-center justify-center rounded border text-[10px] leading-none text-muted-foreground">
                K
              </kbd>
            </span>
          ) : (
            <kbd className="ml-auto rounded border px-1 text-[10px] leading-normal text-muted-foreground">
              Ctrl K
            </kbd>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
        >
          <Settings className="size-4" />
          <span>Settings</span>
        </button>

        <button
          type="button"
          onClick={() => void createPage(null)}
          className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
        >
          <Plus className="size-4" />
          <span>New page</span>
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-8">
          {favorites.length > 0 && (
            <section className="mb-3">
              <h2 className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Favorites
              </h2>
              {favorites.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => openPage(node.id)}
                  className={cn(
                    'flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-sm',
                    currentPageId === node.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60'
                  )}
                >
                  <span className="flex size-5 flex-none items-center justify-center text-base leading-none">
                    <PageIcon
                      icon={node.icon}
                      fallback={<FileText className="size-3.5 text-muted-foreground" />}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{displayTitle(node.title)}</span>
                </button>
              ))}
            </section>
          )}

          <section>
            <h2 className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Pages
            </h2>

            {tree.map((node) => (
              <PageTreeItem
                key={node.id}
                node={node}
                depth={0}
                siblings={rootIds}
                onRequestDelete={onRequestDelete}
              />
            ))}

            {tree.length === 0 && (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                No pages yet. Create your first one above.
              </p>
            )}
          </section>

          {/* Dropping here promotes a nested page back to the top level. */}
          <div
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setRootDropActive(true)
            }}
            onDragLeave={() => setRootDropActive(false)}
            onDrop={(event) => {
              event.preventDefault()
              setRootDropActive(false)
              const draggedId = event.dataTransfer.getData(PAGE_DRAG_TYPE)
              if (draggedId) {
                void movePage({ id: draggedId, parentId: null, index: rootIds.length })
              }
            }}
            className={cn(
              'mt-1 rounded-md border border-dashed px-2 py-2 text-center text-xs transition-colors',
              rootDropActive
                ? 'border-ring text-foreground'
                : 'border-transparent text-transparent'
            )}
          >
            Move to top level
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
