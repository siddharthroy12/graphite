import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Apple,
  Car,
  Clock,
  Flag,
  Hash,
  ImagePlus,
  Leaf,
  Lightbulb,
  Search,
  Shuffle,
  Smile,
  Trophy,
  icons as lucideIcons
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  EMOJI_BY_CATEGORY,
  EMOJI_CATEGORIES,
  SKIN_TONE_COUNT,
  SKIN_TONE_SWATCHES,
  randomEmoji,
  searchEmoji,
  withSkinTone,
  type EmojiEntry
} from '@/lib/emoji'
import { lucideLabel, randomLucideIcon, searchLucideIcons } from '@/lib/icon-set'
import { PageIcon } from './PageIcon'
import {
  ICON_COLORS,
  ICON_UPLOAD_MAX_BYTES,
  ICON_UPLOAD_TYPES,
  lucideIconValue,
  parseIcon,
  type IconColor
} from '@shared/icon'

type PickerTab = 'emoji' | 'icons' | 'upload'

const TABS: Array<{ key: PickerTab; label: string }> = [
  { key: 'emoji', label: 'Emoji' },
  { key: 'icons', label: 'Icons' },
  { key: 'upload', label: 'Upload' }
]

/** The rail along the bottom of the emoji tab: one jump target per section. */
const RAIL_ICONS: Record<string, typeof Smile> = {
  recent: Clock,
  people: Smile,
  nature: Leaf,
  food: Apple,
  activity: Trophy,
  travel: Car,
  objects: Lightbulb,
  symbols: Hash,
  flags: Flag
}

/** How many lucide icons to render before the grid is scrolled further. */
const ICON_PAGE_SIZE = 240

const MAX_RECENTS = 24

interface IconPickerProps {
  value: string | null
  onChange(icon: string | null): void
  children: React.ReactNode
}

export function IconPicker({ value, onChange, children }: IconPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PickerTab>('emoji')
  const [query, setQuery] = useState('')
  const [skinTone, setSkinTone] = useState(0)
  const [iconColor, setIconColor] = useState<IconColor | null>(null)
  const [recents, setRecents] = useState<string[]>([])

  // Recents and the chosen skin tone are preferences, not page data, so they
  // are read and written straight through rather than via the workspace store.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.api.prefs.get().then((prefs) => {
      if (cancelled) return
      setRecents(prefs.recentIcons ?? [])
      setSkinTone(prefs.iconSkinTone ?? 0)

      // The page's own icon wins over the remembered colour: reopening the
      // picker on a blue icon should start from blue, so swapping the glyph
      // doesn't silently change its colour too.
      const current = parseIcon(value)
      setIconColor(
        current?.kind === 'lucide' && current.color
          ? current.color
          : ((prefs.iconColor as IconColor | null) ?? null)
      )
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const pick = useCallback(
    (icon: string | null): void => {
      onChange(icon)
      setOpen(false)
      setQuery('')

      if (icon) {
        const next = [icon, ...recents.filter((entry) => entry !== icon)].slice(0, MAX_RECENTS)
        setRecents(next)
        void window.api.prefs.set({ recentIcons: next })
      }
    },
    [onChange, recents]
  )

  const chooseSkinTone = useCallback((tone: number): void => {
    setSkinTone(tone)
    void window.api.prefs.set({ iconSkinTone: tone })
  }, [])

  const chooseIconColor = useCallback((color: IconColor | null): void => {
    setIconColor(color)
    void window.api.prefs.set({ iconColor: color })
  }, [])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-2">
          <div className="flex">
            {TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  setTab(entry.key)
                  setQuery('')
                }}
                className={cn(
                  'border-b-2 px-2 py-2 text-sm transition-colors',
                  tab === entry.key
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!value}
            onClick={() => pick(null)}
            className="px-1 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Remove
          </button>
        </div>

        {tab === 'emoji' && (
          <EmojiTab
            query={query}
            onQueryChange={setQuery}
            skinTone={skinTone}
            onSkinToneChange={chooseSkinTone}
            recents={recents}
            onPick={pick}
          />
        )}

        {tab === 'icons' && (
          <IconsTab
            query={query}
            onQueryChange={setQuery}
            color={iconColor}
            onColorChange={chooseIconColor}
            onPick={pick}
          />
        )}

        {tab === 'upload' && <UploadTab onPick={pick} />}
      </PopoverContent>
    </Popover>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

interface SearchRowProps {
  query: string
  onQueryChange(query: string): void
  onShuffle(): void
  children?: React.ReactNode
}

function SearchRow({ query, onQueryChange, onShuffle, children }: SearchRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 p-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          placeholder="Filter…"
          className="h-8 pl-7"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <Button
        variant="outline"
        size="icon"
        className="size-8 flex-none"
        title="Pick a random one"
        aria-label="Pick a random one"
        onClick={onShuffle}
      >
        <Shuffle className="size-3.5" />
      </Button>

      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="sticky top-0 z-10 bg-popover py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  )
}

function EmptyState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-1 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

/* -------------------------------------------------------------------------- */
/* Emoji                                                                      */
/* -------------------------------------------------------------------------- */

interface EmojiTabProps {
  query: string
  onQueryChange(query: string): void
  skinTone: number
  onSkinToneChange(tone: number): void
  recents: string[]
  onPick(icon: string): void
}

function EmojiTab({
  query,
  onQueryChange,
  skinTone,
  onSkinToneChange,
  recents,
  onPick
}: EmojiTabProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const results = useMemo(() => (query.trim() ? searchEmoji(query) : null), [query])

  const scrollToSection = (key: string): void => {
    const section = sectionRefs.current[key]
    const container = scrollRef.current
    if (!section || !container) return
    container.scrollTo({ top: section.offsetTop - container.offsetTop })
  }

  return (
    <>
      <SearchRow
        query={query}
        onQueryChange={onQueryChange}
        onShuffle={() => onPick(withSkinTone(randomEmoji(), skinTone))}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-8 flex-none text-base leading-none"
              title="Skin tone"
              aria-label="Skin tone"
            >
              {SKIN_TONE_SWATCHES[skinTone]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-0">
            {Array.from({ length: SKIN_TONE_COUNT }, (_, tone) => (
              <DropdownMenuItem
                key={tone}
                className={cn('justify-center text-base', tone === skinTone && 'bg-accent')}
                onSelect={() => onSkinToneChange(tone)}
              >
                {SKIN_TONE_SWATCHES[tone]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SearchRow>

      <div ref={scrollRef} className="h-64 overflow-y-auto px-2 pb-2">
        {results ? (
          results.length > 0 ? (
            <EmojiGrid emoji={results} skinTone={skinTone} onPick={onPick} />
          ) : (
            <EmptyState>No emoji found</EmptyState>
          )
        ) : (
          <>
            {recents.length > 0 && (
              <div
                ref={(element) => {
                  sectionRefs.current.recent = element
                }}
              >
                <SectionLabel>Recent</SectionLabel>
                <div className="grid grid-cols-9 gap-0.5">
                  {recents.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => onPick(icon)}
                      className="flex size-8 items-center justify-center rounded-md text-xl transition-colors hover:bg-accent"
                    >
                      <PageIcon icon={icon} className="text-[1.25rem]" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {EMOJI_CATEGORIES.map((category) => (
              <div
                key={category.key}
                ref={(element) => {
                  sectionRefs.current[category.key] = element
                }}
              >
                <SectionLabel>{category.label}</SectionLabel>
                <EmojiGrid
                  emoji={EMOJI_BY_CATEGORY[category.key]}
                  skinTone={skinTone}
                  onPick={onPick}
                />
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-2 py-1">
        {[...(recents.length > 0 ? ['recent'] : []), ...EMOJI_CATEGORIES.map((c) => c.key)].map(
          (key) => {
            const Icon = RAIL_ICONS[key]
            const label =
              key === 'recent'
                ? 'Recent'
                : (EMOJI_CATEGORIES.find((category) => category.key === key)?.label ?? key)
            return (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                disabled={Boolean(query.trim())}
                onClick={() => scrollToSection(key)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <Icon className="size-4" />
              </button>
            )
          }
        )}
      </div>
    </>
  )
}

interface EmojiGridProps {
  emoji: EmojiEntry[]
  skinTone: number
  onPick(icon: string): void
}

function EmojiGrid({ emoji, skinTone, onPick }: EmojiGridProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-9 gap-0.5">
      {emoji.map((entry) => {
        const character = withSkinTone(entry, skinTone)
        return (
          <button
            key={entry.label}
            type="button"
            title={entry.label}
            onClick={() => onPick(character)}
            className="flex size-8 items-center justify-center rounded-md text-xl leading-none transition-colors hover:bg-accent"
          >
            {character}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

interface IconsTabProps {
  query: string
  onQueryChange(query: string): void
  color: IconColor | null
  onColorChange(color: IconColor | null): void
  onPick(icon: string): void
}

/** The colour dot: a ring for "default", a filled circle for a real colour. */
function Swatch({ color }: { color: IconColor | null }): React.JSX.Element {
  return (
    <span
      className={cn('size-3.5 flex-none rounded-full', color === null && 'border border-current')}
      style={color ? { backgroundColor: ICON_COLORS[color] } : undefined}
    />
  )
}

function IconsTab({
  query,
  onQueryChange,
  color,
  onColorChange,
  onPick
}: IconsTabProps): React.JSX.Element {
  const [visible, setVisible] = useState(ICON_PAGE_SIZE)

  const matches = useMemo(() => searchLucideIcons(query), [query])

  // The set runs to well over a thousand glyphs; mounting them all at once
  // makes opening the tab visibly janky, so the grid grows as it is scrolled.
  useEffect(() => setVisible(ICON_PAGE_SIZE), [query])

  return (
    <>
      <SearchRow
        query={query}
        onQueryChange={onQueryChange}
        onShuffle={() => onPick(lucideIconValue(randomLucideIcon(), color))}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-8 flex-none"
              title={`Colour: ${color ?? 'default'}`}
              aria-label="Icon colour"
            >
              <Swatch color={color} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-0">
            <DropdownMenuItem
              className={cn('gap-2', color === null && 'bg-accent')}
              onSelect={() => onColorChange(null)}
            >
              <Swatch color={null} />
              Default
            </DropdownMenuItem>
            {(Object.keys(ICON_COLORS) as IconColor[]).map((name) => (
              <DropdownMenuItem
                key={name}
                className={cn('gap-2 capitalize', color === name && 'bg-accent')}
                onSelect={() => onColorChange(name)}
              >
                <Swatch color={name} />
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SearchRow>

      <div
        className="h-64 overflow-y-auto px-2 pb-2"
        onScroll={(event) => {
          const element = event.currentTarget
          if (element.scrollHeight - element.scrollTop - element.clientHeight < 200) {
            setVisible((current) => Math.min(current + ICON_PAGE_SIZE, matches.length))
          }
        }}
      >
        {matches.length === 0 ? (
          <EmptyState>No icons found</EmptyState>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {matches.slice(0, visible).map((name) => {
              const Icon = lucideIcons[name as keyof typeof lucideIcons]
              return (
                <button
                  key={name}
                  type="button"
                  title={lucideLabel(name)}
                  onClick={() => onPick(lucideIconValue(name, color))}
                  className="flex size-9 items-center justify-center rounded-md transition-colors hover:bg-accent"
                >
                  {/* Previewed in the chosen colour, so the grid shows exactly
                      what picking one will put on the page. */}
                  <Icon
                    className="size-[1.15rem]"
                    style={color ? { color: ICON_COLORS[color] } : undefined}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Upload                                                                     */
/* -------------------------------------------------------------------------- */

const ACCEPTED_TYPES = Object.keys(ICON_UPLOAD_TYPES)

function UploadTab({ onPick }: { onPick(icon: string): void }): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const upload = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (!file) return

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('That file type is not supported — use PNG, JPEG, GIF, WebP or SVG.')
        return
      }
      if (file.size > ICON_UPLOAD_MAX_BYTES) {
        setError(`Images must be under ${ICON_UPLOAD_MAX_BYTES / 1024 / 1024} MB.`)
        return
      }

      setBusy(true)
      setError(null)
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        onPick(await window.api.images.upload(bytes, file.type, 'icon'))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save that image.')
      } finally {
        setBusy(false)
      }
    },
    [onPick]
  )

  return (
    <div className="p-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void upload(event.dataTransfer.files[0])
        }}
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
          dragging && 'border-ring bg-accent/50'
        )}
      >
        <ImagePlus className="size-6 text-muted-foreground" />
        <div>
          <p className="text-sm">Drop an image here</p>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, GIF, WebP or SVG, up to {ICON_UPLOAD_MAX_BYTES / 1024 / 1024} MB
          </p>
        </div>

        <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : 'Choose a file'}
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(event) => {
            void upload(event.target.files?.[0])
            // Clear it, so picking the same file twice in a row still fires.
            event.target.value = ''
          }}
        />
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}
