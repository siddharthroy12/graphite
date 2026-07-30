import { useEffect, useState } from 'react'
import type { PageSummary, SearchResult } from '@shared/types'
import { Clock, FileText, Plus } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { displayTitle } from '@/lib/tree'
import { useWorkspace } from '@/lib/workspace'
import { PageIcon } from './PageIcon'

interface SearchDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps): React.JSX.Element {
  const { openPage, createPage } = useWorkspace()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [recent, setRecent] = useState<PageSummary[]>([])

  // Recents are the empty state, refreshed each time the palette opens.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults([])
    void window.api.pages.recent(8).then(setRecent)
  }, [open])

  useEffect(() => {
    if (!open) return

    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }

    let cancelled = false
    // Debounced so each keystroke doesn't hit SQLite.
    const timer = setTimeout(() => {
      void window.api.pages.search(trimmed).then((found) => {
        if (!cancelled) setResults(found)
      })
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open])

  const select = (id: string): void => {
    openPage(id)
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search pages"
      description="Find a page by title or content"
      // Results are already ranked by SQLite; cmdk must not re-sort or re-filter them.
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        placeholder="Search pages…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No pages match “{query}”.</CommandEmpty>

        {query.trim() === '' && recent.length > 0 && (
          <CommandGroup heading="Recently edited">
            {recent.map((page) => (
              <CommandItem key={page.id} value={page.id} onSelect={() => select(page.id)}>
                <span className="flex size-4 items-center justify-center text-base leading-none">
                  <PageIcon
                    icon={page.icon}
                    fallback={<Clock className="size-4 text-muted-foreground" />}
                  />
                </span>
                <span className="truncate">{displayTitle(page.title)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.length > 0 && (
          <CommandGroup heading="Pages">
            {results.map((result) => (
              <CommandItem key={result.id} value={result.id} onSelect={() => select(result.id)}>
                <span className="flex size-4 items-center justify-center text-base leading-none">
                  <PageIcon
                    icon={result.icon}
                    fallback={<FileText className="size-4 text-muted-foreground" />}
                  />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{displayTitle(result.title)}</span>
                  {result.snippet && (
                    <span className="truncate text-xs text-muted-foreground">
                      {result.snippet}
                    </span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {query.trim() !== '' && (
          <CommandGroup heading="Actions">
            <CommandItem
              value="__create__"
              onSelect={() => {
                void createPage(null)
                onOpenChange(false)
              }}
            >
              <Plus className="size-4" />
              Create a new page
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
