import { useCallback, useRef, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Download, File as FileIcon, Image as ImageIcon, Music, Video } from 'lucide-react'
import {
  MEDIA_ACCEPT,
  MEDIA_NODE,
  MEDIA_UPLOAD_MAX_BYTES,
  formatBytes,
  type MediaAttrs,
  type MediaKind
} from '@shared/media'
import { iconFileUrl, parseIcon } from '@shared/icon'
import { cn } from '@/lib/utils'

const KIND_META: Record<MediaKind, { icon: typeof FileIcon; label: string }> = {
  image: { icon: ImageIcon, label: 'Add an image' },
  video: { icon: Video, label: 'Add a video' },
  audio: { icon: Music, label: 'Add audio' },
  file: { icon: FileIcon, label: 'Add a file' }
}

/** The URL a `file:` value is served from, or null for anything unrecognised. */
function srcUrl(src: string | null): string | null {
  const parsed = parseIcon(src)
  return parsed?.kind === 'file' ? iconFileUrl(parsed.file) : null
}

/** Whether a picked file's MIME type suits the block's kind. `file` takes anything. */
function kindAccepts(kind: MediaKind, mime: string): boolean {
  if (kind === 'file') return true
  return mime.startsWith(`${kind}/`)
}

function MediaBlockView({ node, updateAttributes, editor }: NodeViewProps): React.JSX.Element {
  const attrs = node.attrs as MediaAttrs
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const upload = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (!file) return
      if (!kindAccepts(attrs.kind, file.type)) {
        setError(`That file isn't ${attrs.kind === 'audio' ? 'an audio file' : `a${attrs.kind === 'image' ? 'n' : ''} ${attrs.kind}`}.`)
        return
      }
      if (file.size > MEDIA_UPLOAD_MAX_BYTES) {
        setError(`Files must be under ${MEDIA_UPLOAD_MAX_BYTES / 1024 / 1024} MB.`)
        return
      }

      setBusy(true)
      setError(null)
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const src = await window.api.media.upload(bytes, file.type, file.name)
        updateAttributes({ src, name: file.name, size: file.size } satisfies Partial<MediaAttrs>)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not upload that file.')
      } finally {
        setBusy(false)
      }
    },
    [attrs.kind, updateAttributes]
  )

  const url = srcUrl(attrs.src)

  if (url) {
    return (
      <NodeViewWrapper
        className={cn(
          // `node-media-content` gives index.css something to trace the
          // selection ring around: `.node-media` (the outer element, one
          // level up) always carries a constant 5px padding for alignment
          // with every other block, so a ring drawn on it would sit flush
          // with that outer edge, leaving the padding as a visible gap
          // before the actual image. Tracing this element instead keeps the
          // ring flush with the content itself.
          //
          // No margin here: `.tiptap > * + *` already spaces every direct
          // child of the editor uniformly (see index.css), applied to the
          // outer element tiptap mounts this node view in — a margin on this
          // inner wrapper too would be redundant.
          //
          // A `div` is block-level by default, so it would otherwise stretch
          // to the full column width regardless of the media's own rendered
          // size. Shrink-wrapping it to its content keeps the ring flush
          // with the actual image/video/file card. Audio is the one
          // exception: its player bar is meant to span the column, so it
          // keeps the full width and the ring rightly matches that.
          'node-media-content',
          attrs.kind !== 'audio' && 'w-fit max-w-full'
        )}
      >
        <MediaContent kind={attrs.kind} url={url} name={attrs.name} size={attrs.size} />
      </NodeViewWrapper>
    )
  }

  const { icon: Icon, label } = KIND_META[attrs.kind]

  // A trashed (read-only) page can't upload; show a quiet placeholder instead.
  if (!editor.isEditable) {
    return (
      <NodeViewWrapper>
        <div
          contentEditable={false}
          className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground/60 select-none"
        >
          <Icon className="size-4 flex-none" />
          Empty {attrs.kind} block
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="my-2">
      <div
        contentEditable={false}
        onClick={() => inputRef.current?.click()}
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
          'flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent',
          (dragging || busy) && 'border-ring bg-accent/60'
        )}
      >
        <Icon className="size-4 flex-none" />
        <span>{busy ? 'Uploading…' : label}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT[attrs.kind] || undefined}
        className="hidden"
        onChange={(event) => {
          void upload(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </NodeViewWrapper>
  )
}

interface MediaContentProps {
  kind: MediaKind
  url: string
  name: string | null
  size: number | null
}

function MediaContent({ kind, url, name, size }: MediaContentProps): React.JSX.Element {
  if (kind === 'image') {
    return (
      <img
        src={url}
        alt={name ?? ''}
        draggable={false}
        className="max-h-[32rem] max-w-full rounded-[3px]"
      />
    )
  }

  if (kind === 'video') {
    return <video src={url} controls className="max-h-[32rem] max-w-full rounded-[3px]" />
  }

  if (kind === 'audio') {
    return <audio src={url} controls className="w-full" />
  }

  return <FileCard url={url} name={name} size={size} />
}

function FileCard({
  url,
  name,
  size
}: {
  url: string
  name: string | null
  size: number | null
}): React.JSX.Element {
  const download = useCallback(async (): Promise<void> => {
    // The file is served from a custom scheme, so a plain download link is
    // blocked by the navigation guard — fetch the bytes and save a blob.
    const response = await fetch(url)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = name ?? 'file'
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }, [url, name])

  return (
    <div
      contentEditable={false}
      className="flex items-center gap-3 rounded-[3px] border px-3 py-2.5 select-none"
    >
      <FileIcon className="size-5 flex-none text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name ?? 'File'}</p>
        {size != null && <p className="text-xs text-muted-foreground">{formatBytes(size)}</p>}
      </div>
      <button
        type="button"
        title="Download"
        aria-label={`Download ${name ?? 'file'}`}
        onClick={() => void download()}
        className="flex size-8 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Download className="size-4" />
      </button>
    </div>
  )
}

/**
 * One node backs the image, video, audio and file blocks — the `kind` attribute
 * picks the picker filter and how it renders. The uploaded bytes live in the
 * shared uploads directory as a `file:` value in `src`; deleting the block
 * leaves the file for the startup sweep to collect once nothing references it.
 */
export const MediaBlock = Node.create({
  name: MEDIA_NODE,

  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: 'file' as MediaKind,
        parseHTML: (element) => element.getAttribute('data-kind'),
        renderHTML: (attributes) => ({ 'data-kind': attributes.kind })
      },
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-src'),
        renderHTML: (attributes) => (attributes.src ? { 'data-src': attributes.src } : {})
      },
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-name'),
        renderHTML: (attributes) => (attributes.name ? { 'data-name': attributes.name } : {})
      },
      size: {
        default: null,
        parseHTML: (element) => {
          const raw = Number(element.getAttribute('data-size'))
          return Number.isFinite(raw) && raw > 0 ? raw : null
        },
        renderHTML: (attributes) =>
          attributes.size ? { 'data-size': String(attributes.size) } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-media]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-media': '' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaBlockView)
  }
})
