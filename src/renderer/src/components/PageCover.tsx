import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { COVER_HEIGHT, parseCover } from '@shared/cover'
import { iconFileUrl } from '@shared/icon'
import { CoverPicker } from './CoverPicker'

interface PageCoverProps {
  cover: string
  position: number
  onChange(cover: string | null): void
  onPositionChange(position: number): void
}

/**
 * The banner above a page's title. Uploaded images are shown cropped to the
 * banner's height and can be dragged vertically to choose which slice shows;
 * the gradient presets have nothing to reposition, so they don't offer it.
 */
export function PageCover({
  cover,
  position,
  onChange,
  onPositionChange
}: PageCoverProps): React.JSX.Element | null {
  const parsed = parseCover(cover)
  const [repositioning, setRepositioning] = useState(false)
  // While dragging, the offset is local state so the image tracks the pointer
  // without a database write per frame; it's committed on release.
  const [draft, setDraft] = useState(position)
  const dragRef = useRef<{ startY: number; startPosition: number } | null>(null)

  useEffect(() => setDraft(position), [position])

  const stopDrag = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    setDraft((current) => {
      onPositionChange(current)
      return current
    })
  }, [onPositionChange])

  useEffect(() => {
    if (!repositioning) return

    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      // A full drag across the banner's own height sweeps the whole image.
      const delta = (event.clientY - drag.startY) / COVER_HEIGHT
      setDraft(Math.min(1, Math.max(0, drag.startPosition - delta)))
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stopDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stopDrag)
    }
  }, [repositioning, stopDrag])

  if (!parsed) return null

  const isImage = parsed.kind === 'file'

  return (
    <div
      className="group/cover relative w-full overflow-hidden"
      style={{ height: COVER_HEIGHT }}
    >
      {isImage ? (
        <img
          src={iconFileUrl(parsed.file)}
          alt=""
          draggable={false}
          onPointerDown={(event) => {
            if (!repositioning) return
            event.preventDefault()
            dragRef.current = { startY: event.clientY, startPosition: draft }
          }}
          className={cn(
            'size-full object-cover select-none',
            repositioning && 'cursor-grab active:cursor-grabbing'
          )}
          style={{ objectPosition: `50% ${draft * 100}%` }}
        />
      ) : (
        <div className="size-full" style={{ backgroundImage: parsed.css }} />
      )}

      {/* Controls sit bottom-right, revealed on hover like the icon's own. */}
      <div
        className={cn(
          'absolute right-4 bottom-4 flex gap-1 transition-opacity',
          repositioning ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100'
        )}
      >
        {repositioning ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() => {
                setRepositioning(false)
                onPositionChange(draft)
              }}
            >
              Save position
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() => {
                setRepositioning(false)
                setDraft(position)
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            {isImage && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7"
                onClick={() => setRepositioning(true)}
              >
                Reposition
              </Button>
            )}
            <CoverPicker value={cover} onChange={onChange}>
              <Button size="sm" variant="secondary" className="h-7">
                Change cover
              </Button>
            </CoverPicker>
          </>
        )}
      </div>

      {repositioning && (
        <p className="pointer-events-none absolute inset-x-0 top-4 text-center text-xs font-medium text-white drop-shadow">
          Drag the image to reposition
        </p>
      )}
    </div>
  )
}
