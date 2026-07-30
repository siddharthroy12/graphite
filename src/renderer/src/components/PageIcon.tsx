import { FileText, icons as lucideIcons } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ICON_COLORS, iconFileUrl, parseIcon } from '@shared/icon'

interface PageIconProps {
  icon: string | null | undefined
  /** Rendered when the page has no icon. Pass `null` to render nothing. */
  fallback?: React.ReactNode
  className?: string
}

/**
 * Renders a page's icon whichever of the three kinds it is.
 *
 * Everything is sized in `em`, so callers keep setting the size the way they
 * always have — with a font size on or above this element — and an uploaded
 * image or a lucide glyph lands at the same size as the emoji it replaced.
 */
export function PageIcon({ icon, fallback, className }: PageIconProps): React.JSX.Element | null {
  const parsed = parseIcon(icon)

  if (!parsed) {
    if (fallback === undefined) {
      return <FileText className={cn('size-[1em] opacity-70', className)} />
    }
    return <>{fallback}</>
  }

  if (parsed.kind === 'emoji') {
    // leading-none: emoji carry the font's full line box, which would otherwise
    // make this taller than the text beside it.
    return <span className={cn('leading-none', className)}>{parsed.text}</span>
  }

  if (parsed.kind === 'lucide') {
    const Icon = lucideIcons[parsed.name as keyof typeof lucideIcons]
    // An uncoloured icon inherits the surrounding text colour, so it keeps
    // working with whatever state the row it sits in is in (hover, selected).
    const style = parsed.color ? { color: ICON_COLORS[parsed.color] } : undefined
    if (!Icon) return <FileText className={cn('size-[1em]', className)} style={style} />
    return <Icon className={cn('size-[1em]', className)} style={style} />
  }

  return (
    <img
      src={iconFileUrl(parsed.file)}
      alt=""
      draggable={false}
      className={cn('size-[1em] rounded-[0.15em] object-cover', className)}
    />
  )
}
