import { useCallback, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { COVER_UPLOAD_MAX_BYTES, GRADIENT_COVERS, gradientCoverValue } from '@shared/cover'
import { ICON_UPLOAD_TYPES } from '@shared/icon'

type CoverTab = 'gallery' | 'upload'

const ACCEPTED_TYPES = Object.keys(ICON_UPLOAD_TYPES)

interface CoverPickerProps {
  value: string | null
  onChange(cover: string | null): void
  children: React.ReactNode
}

/** Picks a page's banner: one of the built-in gradients, or an uploaded image. */
export function CoverPicker({ value, onChange, children }: CoverPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<CoverTab>('gallery')

  const choose = useCallback(
    (cover: string | null): void => {
      onChange(cover)
      setOpen(false)
    },
    [onChange]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-2">
          <div className="flex">
            {(
              [
                ['gallery', 'Gallery'],
                ['upload', 'Upload']
              ] as Array<[CoverTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'border-b-2 px-2 py-2 text-sm transition-colors',
                  tab === key
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!value}
            onClick={() => choose(null)}
            className="px-1 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Remove
          </button>
        </div>

        {tab === 'gallery' ? (
          <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-2">
            {Object.entries(GRADIENT_COVERS).map(([name, css]) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => choose(gradientCoverValue(name))}
                style={{ backgroundImage: css }}
                className={cn(
                  'h-14 rounded-md ring-offset-2 ring-offset-popover transition-shadow hover:ring-2 hover:ring-ring',
                  value === gradientCoverValue(name) && 'ring-2 ring-foreground'
                )}
              />
            ))}
          </div>
        ) : (
          <CoverUpload onUploaded={choose} />
        )}
      </PopoverContent>
    </Popover>
  )
}

function CoverUpload({ onUploaded }: { onUploaded(cover: string): void }): React.JSX.Element {
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
      if (file.size > COVER_UPLOAD_MAX_BYTES) {
        setError(`Images must be under ${COVER_UPLOAD_MAX_BYTES / 1024 / 1024} MB.`)
        return
      }

      setBusy(true)
      setError(null)
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        onUploaded(await window.api.images.upload(bytes, file.type, 'cover'))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save that image.')
      } finally {
        setBusy(false)
      }
    },
    [onUploaded]
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
            Wide images work best, up to {COVER_UPLOAD_MAX_BYTES / 1024 / 1024} MB
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Uploading…' : 'Choose a file'}
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(event) => {
            void upload(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}
