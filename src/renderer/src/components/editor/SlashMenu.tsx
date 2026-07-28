import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { SuggestionProps } from '@tiptap/suggestion'
import { cn } from '@/lib/utils'
import type { SlashItem } from './slash-command'

export interface SlashMenuHandle {
  onKeyDown(props: { event: KeyboardEvent }): boolean
}

/**
 * The `/` block picker. Tiptap renders this outside the React tree, so keyboard
 * handling is exposed imperatively rather than through DOM focus.
 */
export const SlashMenu = forwardRef<SlashMenuHandle, SuggestionProps<SlashItem>>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)

    // A changing filter can leave the cursor past the end of the new list.
    useEffect(() => setSelected(0), [items])

    useEffect(() => {
      listRef.current
        ?.querySelector(`[data-index="${selected}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }, [selected])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false

        if (event.key === 'ArrowUp') {
          setSelected((prev) => (prev + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelected((prev) => (prev + 1) % items.length)
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          command(items[selected])
          return true
        }
        return false
      }
    }))

    if (items.length === 0) {
      return (
        <div className="w-72 rounded-lg border bg-popover p-3 text-sm text-muted-foreground shadow-md">
          No blocks found
        </div>
      )
    }

    return (
      <div
        ref={listRef}
        className="max-h-80 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
      >
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <button
              key={item.title}
              type="button"
              data-index={index}
              onMouseEnter={() => setSelected(index)}
              // `mousedown` would blur the editor before the command runs.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command(item)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                index === selected ? 'bg-accent text-accent-foreground' : 'text-foreground'
              )}
            >
              <span className="flex size-8 flex-none items-center justify-center rounded-md border bg-background">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    )
  }
)

SlashMenu.displayName = 'SlashMenu'
