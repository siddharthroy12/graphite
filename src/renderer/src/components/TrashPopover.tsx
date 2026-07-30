import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TrashedPage } from '@shared/types'
import { TRASH_RETENTION_DAYS } from '@shared/trash'
import { FileText, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { displayTitle } from '@/lib/tree'
import { useWorkspace } from '@/lib/workspace'
import { PageIcon } from './PageIcon'

/**
 * The trash, as a popover anchored to its sidebar entry (à la Notion): a
 * filter box, the trashed pages with their original location, and per-row
 * restore / delete-forever actions.
 */
export function TrashPopover({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { restorePage, permanentlyDeletePage, openPage } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TrashedPage[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const refresh = useCallback(async () => {
    setItems(await window.api.pages.trashList())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      void refresh()
    }
  }, [open, refresh])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => displayTitle(item.title).toLowerCase().includes(needle))
  }, [items, query])

  const restore = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((item) => item.id !== id))
      await restorePage(id)
    },
    [restorePage]
  )

  const permanentlyDelete = useCallback(
    async (page: TrashedPage) => {
      const confirmed = window.confirm(
        `Delete "${displayTitle(page.title)}" for good? This cannot be undone.`
      )
      if (!confirmed) return
      setItems((prev) => prev.filter((item) => item.id !== page.id))
      await permanentlyDeletePage(page.id)
    },
    [permanentlyDeletePage]
  )

  const openTrashed = useCallback(
    (id: string) => {
      openPage(id)
      setOpen(false)
    },
    [openPage]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="flex h-[26rem] w-[26rem] flex-col overflow-hidden p-0"
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              placeholder="Search pages in Trash"
              className="h-8 pl-7"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {loading ? null : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {items.length === 0 ? 'Trash is empty.' : 'No pages match your search.'}
            </p>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <button
                  type="button"
                  onClick={() => openTrashed(item.id)}
                  title={`Open ${displayTitle(item.title)}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex size-5 flex-none items-center justify-center text-base leading-none">
                    <PageIcon
                      icon={item.icon}
                      fallback={<FileText className="size-4 text-muted-foreground" />}
                    />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{displayTitle(item.title)}</span>
                    {item.parentTitle && (
                      <span className="truncate text-xs text-muted-foreground">
                        {displayTitle(item.parentTitle)}
                      </span>
                    )}
                  </span>
                </button>

                {/* Revealed on row hover, as in the reference. */}
                <div className="flex flex-none items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    title="Restore"
                    aria-label={`Restore ${displayTitle(item.title)}`}
                    onClick={() => void restore(item.id)}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    title="Delete forever"
                    aria-label={`Delete ${displayTitle(item.title)} forever`}
                    onClick={() => void permanentlyDelete(item)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Once a page has been in Trash for {TRASH_RETENTION_DAYS} days, it will be automatically
          deleted.
        </p>
      </PopoverContent>
    </Popover>
  )
}
