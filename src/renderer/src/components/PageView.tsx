import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageSummary } from '@shared/types'
import { ChevronRight, Plus, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { displayTitle } from '@/lib/tree'
import { useWorkspace } from '@/lib/workspace'
import { Editor } from './editor/Editor'
import { IconPicker } from './IconPicker'

export function PageView(): React.JSX.Element {
  const {
    currentPage,
    currentPageId,
    tree,
    renamePage,
    setPageIcon,
    createPage,
    updateContent,
    openPage
  } = useWorkspace()

  const [breadcrumb, setBreadcrumb] = useState<PageSummary[]>([])
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!currentPageId) {
      setBreadcrumb([])
      return
    }
    let cancelled = false
    void window.api.pages.breadcrumb(currentPageId).then((crumbs) => {
      if (!cancelled) setBreadcrumb(crumbs)
    })
    return () => {
      cancelled = true
    }
  }, [currentPageId, tree])

  // The title is a textarea so it can wrap; it has to grow with its content.
  const resizeTitle = useCallback(() => {
    const element = titleRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [])

  useEffect(resizeTitle, [currentPage?.id, currentPage?.title, resizeTitle])

  const handleContentChange = useCallback(
    (content: string, plainText: string) => {
      if (currentPageId) updateContent(currentPageId, content, plainText)
    },
    [currentPageId, updateContent]
  )

  const focusTitle = useCallback(() => {
    const element = titleRef.current
    element?.focus()
    element?.setSelectionRange(element.value.length, element.value.length)
  }, [])

  if (!currentPage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div>
          <p className="text-lg font-medium">No page open</p>
          <p className="text-sm text-muted-foreground">
            Create a page, or pick one from the sidebar.
          </p>
        </div>
        <Button onClick={() => void createPage(null)}>
          <Plus className="size-4" />
          New page
        </Button>
      </div>
    )
  }

  const parents = breadcrumb.slice(0, -1)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-16 pt-6 pb-40">
        {parents.length > 0 && (
          <nav className="mb-3 flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
            {parents.map((crumb) => (
              <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => openPage(crumb.id)}
                  className="max-w-[12rem] truncate rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {crumb.icon ? `${crumb.icon} ` : ''}
                  {displayTitle(crumb.title)}
                </button>
                <ChevronRight className="size-3.5 flex-none text-muted-foreground/60" />
              </span>
            ))}
          </nav>
        )}

        <div className="group/icon mb-2">
          <IconPicker
            value={currentPage.icon}
            onChange={(icon) => void setPageIcon(currentPage.id, icon)}
          >
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 rounded-md text-left transition-colors',
                currentPage.icon
                  ? 'text-6xl leading-none hover:opacity-80'
                  : 'px-2 py-1 text-sm text-muted-foreground opacity-0 hover:bg-accent group-hover/icon:opacity-100'
              )}
            >
              {currentPage.icon ?? (
                <>
                  <Smile className="size-4" />
                  Add icon
                </>
              )}
            </button>
          </IconPicker>
        </div>

        <textarea
          ref={titleRef}
          value={currentPage.title}
          rows={1}
          placeholder="Untitled"
          spellCheck
          className="w-full resize-none overflow-hidden bg-transparent text-[2.5rem] leading-tight font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
          onChange={(event) => {
            renamePage(currentPage.id, event.target.value)
            resizeTitle()
          }}
          onKeyDown={(event) => {
            // Enter and Tab both hand off to the body, never break the title.
            if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
              event.preventDefault()
              document.querySelector<HTMLElement>('.graphite-editor .tiptap')?.focus()
            }
          }}
        />

        <div className="mt-3">
          <Editor
            pageId={currentPage.id}
            initialContent={currentPage.content}
            onChange={handleContentChange}
            onFocusTitle={focusTitle}
          />
        </div>
      </div>
    </div>
  )
}
