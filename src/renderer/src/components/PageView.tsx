import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageSummary, PageTreeNode } from '@shared/types'
import { daysUntilPurge } from '@shared/trash'
import { DEFAULT_PAGE_FONT, PAGE_FONTS, isPageFont, pageFontClass, type PageFont } from '@shared/font'
import {
  ChevronRight,
  Copy,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Smile,
  Star,
  Trash2
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
import { useWorkspace } from '@/lib/workspace'
import { Editor } from './editor/Editor'
import { CoverPicker } from './CoverPicker'
import { IconPicker } from './IconPicker'
import { PageCover } from './PageCover'
import { PageIcon } from './PageIcon'

interface PageViewProps {
  onRequestDelete(node: PageTreeNode): void
}

export function PageView({ onRequestDelete }: PageViewProps): React.JSX.Element {
  const {
    currentPage,
    currentPageId,
    tree,
    renamePage,
    setPageIcon,
    setPageCover,
    setPageCoverPosition,
    createPage,
    duplicatePage,
    toggleFavorite,
    restorePage,
    permanentlyDeletePage,
    setPageFont,
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

  // The whole path, current page included — a top-level page still gets a
  // trail, showing just itself. The last crumb reads its title from the open
  // page rather than the fetched breadcrumb, so it tracks typing immediately
  // instead of waiting for the next save.
  const trail = (
    <nav className="flex min-w-0 flex-wrap items-center gap-0.5 py-0.5 text-sm">
      {breadcrumb.map((crumb, index) => {
        const isCurrent = index === breadcrumb.length - 1
        return (
          <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => openPage(crumb.id)}
              className={cn(
                'flex max-w-[12rem] items-center gap-1 truncate rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground',
                isCurrent ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <PageIcon
                icon={isCurrent ? currentPage.icon : crumb.icon}
                fallback={null}
                className="flex-none"
              />
              <span className="truncate">
                {displayTitle(isCurrent ? currentPage.title : crumb.title)}
              </span>
            </button>
            {!isCurrent && <ChevronRight className="size-3.5 flex-none text-muted-foreground/60" />}
          </span>
        )
      })}
    </nav>
  )

  const trashed = currentPage.deletedAt !== null
  const font: PageFont = isPageFont(currentPage.font) ? currentPage.font : DEFAULT_PAGE_FONT

  return (
    <div className="h-full overflow-y-auto">
      {/* Banner and header pin together as one sticky block — two separate
          `sticky top-0` siblings would stack at the same offset and overlap. */}
      <div className="sticky top-0 z-20">
        {trashed && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-destructive px-4 py-2.5 text-sm text-destructive-foreground">
            <span className="text-center">
              This page is in the trash. It will be permanently deleted in{' '}
              {daysUntilPurge(currentPage.deletedAt!)} days.
            </span>
            <div className="flex flex-none items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-7"
                onClick={() => void restorePage(currentPage.id)}
              >
                <RotateCcw className="size-3.5" />
                Restore page
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7"
                onClick={() => {
                  const confirmed = window.confirm(
                    `Delete "${displayTitle(currentPage.title)}" for good? This cannot be undone.`
                  )
                  if (confirmed) void permanentlyDeletePage(currentPage.id)
                }}
              >
                <Trash2 className="size-3.5" />
                Permanently delete
              </Button>
            </div>
          </div>
        )}

        {/* A header strip across the top of the view — trail on the left, page
            actions on the right — evenly inset by 12px and in the same place
            whether or not the page has a cover. It needs its own background,
            since the page scrolls beneath the sticky block. It has to live
            outside the content column in any case: with a cover, a breadcrumb
            between banner and icon would push the icon off the banner's edge by
            however many ancestors the page happens to have. */}
        <div className="flex items-center justify-between gap-2 bg-background p-3">
          {trail}

          {/* Page-level actions live with the trail rather than in the tab
              bar: they act on this page, not on the window's tabs. A trashed
              page hides them — the banner's restore/delete are the only
              meaningful actions until it's back. */}
          {!trashed && (
            <div className="flex flex-none items-center gap-1">
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
                  <Button variant="ghost" size="icon" className="size-7" aria-label="Page options">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Font picker — a segmented row of previews, like Notion's.
                      Plain buttons, not menu items, so choosing one applies it
                      without closing the menu (you can compare the three). */}
                  <div className="flex gap-1 p-1">
                    {PAGE_FONTS.map((entry) => {
                      const active = font === entry.id
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setPageFont(currentPage.id, entry.id)}
                          className={cn(
                            'flex flex-1 flex-col items-center gap-1 rounded-md border py-2 transition-colors',
                            active
                              ? 'border-primary bg-accent'
                              : 'border-transparent hover:bg-accent'
                          )}
                        >
                          <span
                            className={cn(
                              'text-xl leading-none',
                              pageFontClass(entry.id),
                              active ? 'text-primary' : 'text-foreground'
                            )}
                          >
                            Ag
                          </span>
                          <span className="text-xs text-muted-foreground">{entry.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <DropdownMenuSeparator />

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
                    Move to trash
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {currentPage.cover && (
        <PageCover
          cover={currentPage.cover}
          position={currentPage.coverPosition}
          onChange={(cover) => void setPageCover(currentPage.id, cover)}
          onPositionChange={(position) => void setPageCoverPosition(currentPage.id, position)}
          readOnly={trashed}
        />
      )}

      {/* No top padding: the header strip above already spaces the page off
          the tab bar, and with a cover the icon deliberately rides up onto it.
          The chosen font applies to the whole column — title and body. */}
      <div className={cn('group/page mx-auto w-full max-w-3xl px-16 pt-0 pb-40', pageFontClass(font))}>
        {currentPage.icon && (
          <div
            className={cn(
              'mb-2',
              // Half the icon rides up onto the cover, as in the reference.
              // `relative` alone is enough to paint it above the banner —
              // both are in the same stacking context, and it comes later.
              currentPage.cover && 'relative -mt-8'
            )}
          >
            {trashed ? (
              <span className="text-6xl leading-none">
                <PageIcon icon={currentPage.icon} />
              </span>
            ) : (
              <IconPicker
                value={currentPage.icon}
                onChange={(icon) => void setPageIcon(currentPage.id, icon)}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md text-left text-6xl leading-none transition-opacity hover:opacity-80"
                >
                  <PageIcon icon={currentPage.icon} />
                </button>
              </IconPicker>
            )}
          </div>
        )}

        {/* Only the controls the page is missing, revealed on hover — the same
            way the icon button behaved before covers existed. Not offered on a
            trashed page, which can't be edited. */}
        {!trashed && (!currentPage.icon || !currentPage.cover) && (
          <div
            className={cn(
              'mb-2 flex gap-1 opacity-0 transition-opacity group-hover/page:opacity-100',
              // Nothing is overlapping the cover in this case, so the header
              // still needs its own breathing room below it.
              currentPage.cover && !currentPage.icon && 'pt-4'
            )}
          >
            {!currentPage.icon && (
              <IconPicker
                value={currentPage.icon}
                onChange={(icon) => void setPageIcon(currentPage.id, icon)}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent"
                >
                  <Smile className="size-4" />
                  Add icon
                </button>
              </IconPicker>
            )}

            {!currentPage.cover && (
              <CoverPicker
                value={currentPage.cover}
                onChange={(cover) => void setPageCover(currentPage.id, cover)}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent"
                >
                  <ImageIcon className="size-4" />
                  Add cover
                </button>
              </CoverPicker>
            )}
          </div>
        )}

        <textarea
          ref={titleRef}
          value={currentPage.title}
          rows={1}
          placeholder="Untitled"
          spellCheck
          readOnly={trashed}
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
            editable={!trashed}
          />
        </div>
      </div>
    </div>
  )
}
