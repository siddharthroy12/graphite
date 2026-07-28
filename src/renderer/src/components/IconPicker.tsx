import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** A small curated set — enough to label a page without shipping an emoji index. */
const EMOJI_GROUPS: Array<{ label: string; emoji: string[] }> = [
  {
    label: 'Documents',
    emoji: ['📄', '📝', '📃', '📑', '🗒️', '📔', '📕', '📗', '📘', '📙', '📚', '🗂️', '📁', '📂', '🗃️', '🗄️']
  },
  {
    label: 'Work',
    emoji: ['✅', '☑️', '📌', '📍', '🎯', '📊', '📈', '📉', '💼', '🗓️', '⏰', '⌛', '🔖', '🏷️', '🔑', '⚙️']
  },
  {
    label: 'Ideas',
    emoji: ['💡', '🔥', '⭐', '✨', '🚀', '🧠', '🔍', '🧩', '🎨', '🎵', '📷', '🛠️', '🧪', '🔬', '🌱', '🌍']
  },
  {
    label: 'People',
    emoji: ['👋', '🙂', '😀', '🤔', '👀', '🙌', '👥', '🏠', '☕', '🍕', '🐈', '🐕', '❤️', '🎉', '🎁', '🏆']
  }
]

interface IconPickerProps {
  value: string | null
  onChange(icon: string | null): void
  children: React.ReactNode
}

export function IconPicker({ value, onChange, children }: IconPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')

  const pick = (emoji: string | null): void => {
    onChange(emoji)
    setOpen(false)
    setCustom('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="mb-3 flex items-center gap-2">
          <Input
            value={custom}
            maxLength={8}
            placeholder="Paste any emoji"
            className="h-8"
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && custom.trim()) {
                event.preventDefault()
                pick(custom.trim())
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={!value}
            onClick={() => pick(null)}
          >
            Remove
          </Button>
        </div>

        <div className="max-h-64 space-y-3 overflow-y-auto">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-1">
                {group.emoji.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => pick(emoji)}
                    className="flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-accent"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
