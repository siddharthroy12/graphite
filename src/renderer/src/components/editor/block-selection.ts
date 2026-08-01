import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

/**
 * Notion-style multi-block selection.
 *
 * Two halves:
 *
 * - A marquee. Dragging from the left gutter or from the empty space below the
 *   content draws a rectangle and selects every block it crosses. Starting
 *   inside the text is left alone, so ordinary text selection still works —
 *   including a plain text drag that crosses into another block, which stays
 *   a normal text selection rather than picking up the block look below.
 * - The look. Only for a selection the marquee produced: each covered block
 *   is tinted edge to edge rather than showing a ragged text highlight, and
 *   the native `::selection` is suppressed underneath.
 *
 * The selection itself stays a plain ProseMirror TextSelection, so delete,
 * copy and paste keep working without special cases.
 */

const key = new PluginKey('blockSelection')

/** Pointer travel before a press becomes a marquee, so clicks still register. */
const MARQUEE_THRESHOLD = 4

/**
 * Auto-scroll while a marquee is active: within this many px of the scroll
 * host's top or bottom edge the page starts scrolling, fastest at the edge.
 */
const EDGE_ZONE = 40
const MAX_SCROLL_SPEED = 18

/**
 * Top-level blocks the selection covers, and whether the highlight should be
 * drawn — a partial selection inside one block stays a normal text highlight.
 */
const LIST_NODES = new Set(['bulletList', 'orderedList', 'taskList'])

export interface BlockRange {
  start: number
  end: number
}

/**
 * The document's selectable blocks. A list is not one block — each of its items
 * is, so the marquee and its highlight treat list items the way it treats
 * paragraphs. A list item keeps any nested list inside it as one unit.
 */
export function leafBlockRanges(doc: ProseMirrorNode): BlockRange[] {
  const out: BlockRange[] = []
  doc.forEach((node, offset) => {
    if (LIST_NODES.has(node.type.name)) {
      // `itemOffset` is relative to the list's content, which starts one
      // position inside the list node.
      node.forEach((item, itemOffset) => {
        const start = offset + 1 + itemOffset
        out.push({ start, end: start + item.nodeSize })
      })
    } else {
      out.push({ start: offset, end: offset + node.nodeSize })
    }
  })
  return out
}

/**
 * A TextSelection covering whole blocks from `first` through `last`.
 *
 * `TextSelection.between` snaps each endpoint to the nearest text position —
 * exactly what lands the selection inside a list item's paragraph rather than
 * at the bare list-item boundary, and why it's used for the text-block ends.
 * But that same snapping steps *out* of an atom block (an image or file,
 * which has no text inside), so a marquee that begins or ends on one would
 * drop it from the selection entirely — the block would look tinted (the
 * decoration follows the selection) yet not actually be selected, and delete
 * or copy would skip it. So the ends are resolved separately: a text block
 * contributes its snapped inner position, an atom contributes its own outer
 * boundary — the position before it for the start, after it for the end — so
 * the atom's whole range sits inside the final selection. The result is still
 * a plain TextSelection, so delete/copy/paste need no special-casing.
 */
function blockSpanSelection(
  doc: ProseMirrorNode,
  first: BlockRange,
  last: BlockRange
): TextSelection {
  const firstAtom = doc.nodeAt(first.start)?.isAtom ?? false
  const lastAtom = doc.nodeAt(last.start)?.isAtom ?? false

  // One `between` spanning both ends (not two collapsed ones, which can each
  // snap into a neighbouring block); its snapped ends are used only for the
  // text-block sides. Skipped entirely when both ends are atoms.
  const snapped =
    firstAtom && lastAtom
      ? null
      : TextSelection.between(
          doc.resolve(firstAtom ? first.start : first.start + 1),
          doc.resolve(lastAtom ? last.end : last.end - 1)
        )

  const from = firstAtom ? first.start : snapped!.from
  const to = lastAtom ? last.end : snapped!.to
  return TextSelection.create(doc, from, to)
}

/**
 * True only when the current selection was produced by the marquee gesture —
 * never for an ordinary text selection, however many blocks it happens to
 * span. Dragging from inside text across a block boundary is still just a
 * text selection: it keeps the native highlight and the formatting bar,
 * exactly like selecting within one block.
 */
export function isMarqueeSelection(state: EditorState): boolean {
  return key.getState(state)?.marquee ?? false
}

/** Leaf blocks a non-empty selection overlaps. */
function coveredBlocks(state: {
  doc: ProseMirrorNode
  selection: { from: number; to: number; empty: boolean }
}): BlockRange[] {
  const { selection, doc } = state
  if (selection.empty) return []
  return leafBlockRanges(doc).filter((b) => b.end > selection.from && b.start < selection.to)
}

/** Left edge of the text column; anything left of it is the handle gutter. */
function contentLeftOf(view: EditorView): number {
  const rect = view.dom.getBoundingClientRect()
  const gutter = parseFloat(window.getComputedStyle(view.dom).paddingLeft) || 0
  return rect.left + gutter
}

/** Right edge of the text column; anything past it is the right margin. */
function contentRightOf(view: EditorView): number {
  return view.dom.getBoundingClientRect().right
}

/**
 * The scrollable page area around the editor. Marquee mousedowns are caught
 * here rather than on the editor itself, so the left and right margins beside
 * the content column — which fall outside the editor box — can start one.
 */
function scrollHostOf(start: HTMLElement): HTMLElement {
  let el: HTMLElement | null = start.parentElement
  while (el) {
    const overflowY = window.getComputedStyle(el).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return el
    el = el.parentElement
  }
  return start
}

export const BlockSelection = Extension.create({
  name: 'blockSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin<{ marquee: boolean }>({
        key,

        // Tracks whether the current selection came from the marquee, so a
        // single covered block is tinted only then — a plain text selection of
        // one block keeps the native highlight. Inferring this from geometry is
        // unreliable across nesting depths, so the marquee flags it directly.
        state: {
          init: () => ({ marquee: false }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(key) as { marquee: boolean } | undefined
            if (meta) return meta
            if (tr.selectionSet || tr.docChanged) return { marquee: false }
            return prev
          }
        },

        props: {
          decorations: (state) => {
            // Never for a plain text selection — only the marquee produces
            // the tinted, edge-to-edge block look, whether it covers one item
            // or many.
            if (!isMarqueeSelection(state)) return null

            const blocks = coveredBlocks(state)
            if (blocks.length === 0) return null

            return DecorationSet.create(
              state.doc,
              blocks.map(({ start, end }) =>
                Decoration.node(start, end, { class: 'block-selected' })
              )
            )
          }
        },

        view: (view) => {
          const wrapper = view.dom.closest<HTMLElement>('.graphite-editor')
          if (!wrapper) return {}

          const marquee = document.createElement('div')
          marquee.className = 'block-marquee'
          marquee.setAttribute('contenteditable', 'false')

          for (const stale of wrapper.querySelectorAll('.block-marquee')) stale.remove()
          wrapper.appendChild(marquee)

          const scrollHost = scrollHostOf(wrapper)

          /** True when the pointer is below the last block (vs. in a margin). */
          const belowContent = (clientY: number): boolean => {
            const last = view.dom.lastElementChild
            return !!last && clientY > last.getBoundingClientRect().bottom
          }

          let origin: { x: number; y: number; below: boolean } | null = null
          let active = false
          /** Last known pointer position, in viewport coordinates. */
          let pointer = { x: 0, y: 0 }
          /** Scroll position at the last scroll event, for origin tracking. */
          let lastScrollTop = scrollHost.scrollTop
          /** Current auto-scroll velocity in px/frame; 0 means no edge scroll. */
          let scrollVelocity = 0
          let scrollFrame: number | null = null

          /** True where a drag should lasso blocks rather than select text. */
          const canStart = (event: MouseEvent): boolean => {
            if (event.button !== 0) return false
            const el = event.target
            // The block handles own their own gestures.
            if (el instanceof Element && el.closest('.block-controls')) return false

            // Either margin beside the content, at any height — so a box can
            // begin above the first block, not only alongside it.
            if (event.clientX < contentLeftOf(view)) return true
            if (event.clientX > contentRightOf(view)) return true

            // Empty space below the content, within the column's width.
            return belowContent(event.clientY)
          }

          const selectWithin = (top: number, bottom: number): void => {
            const { doc } = view.state

            // Rows are leaf blocks — list items included — hit-tested by their
            // own DOM rect, so the marquee catches individual items.
            const rows = leafBlockRanges(doc).filter(({ start }) => {
              const dom = view.nodeDOM(start)
              if (!(dom instanceof HTMLElement)) return false
              const rect = dom.getBoundingClientRect()
              return rect.bottom > top && rect.top < bottom
            })
            if (rows.length === 0) return

            const selection = blockSpanSelection(doc, rows[0], rows[rows.length - 1])

            if (!selection.eq(view.state.selection)) {
              view.dispatch(
                view.state.tr.setSelection(selection).setMeta(key, { marquee: true })
              )
            }
          }

          const draw = (point: { x: number; y: number }): void => {
            if (!origin) return
            const wrapperRect = wrapper.getBoundingClientRect()
            const top = Math.min(origin.y, point.y)
            const bottom = Math.max(origin.y, point.y)
            const left = Math.min(origin.x, point.x)
            const right = Math.max(origin.x, point.x)

            marquee.style.top = `${top - wrapperRect.top}px`
            marquee.style.left = `${left - wrapperRect.left}px`
            marquee.style.width = `${right - left}px`
            marquee.style.height = `${bottom - top}px`

            selectWithin(top, bottom)
          }

          // A scroll — wheel, keyboard, scrollbar, or the auto-scroll below —
          // moves the content under a stationary pointer. Keep the origin glued
          // to the document point it started on and redraw, so the box keeps
          // reaching the pointer instead of freezing where it began.
          const onScroll = (): void => {
            const delta = scrollHost.scrollTop - lastScrollTop
            lastScrollTop = scrollHost.scrollTop
            if (!origin || delta === 0) return
            origin.y -= delta
            if (active) draw(pointer)
          }

          /** How fast to auto-scroll for the pointer's current position. */
          const updateEdgeScroll = (): void => {
            const rect = scrollHost.getBoundingClientRect()
            if (pointer.y < rect.top + EDGE_ZONE) {
              scrollVelocity =
                -MAX_SCROLL_SPEED * Math.min(1, (rect.top + EDGE_ZONE - pointer.y) / EDGE_ZONE)
            } else if (pointer.y > rect.bottom - EDGE_ZONE) {
              scrollVelocity =
                MAX_SCROLL_SPEED * Math.min(1, (pointer.y - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE)
            } else {
              scrollVelocity = 0
            }
          }

          // The scroll itself triggers `onScroll`, which does the redraw.
          const stepScroll = (): void => {
            if (!active || scrollVelocity === 0) {
              scrollFrame = null
              return
            }
            scrollHost.scrollTop += scrollVelocity
            scrollFrame = requestAnimationFrame(stepScroll)
          }

          const stopEdgeScroll = (): void => {
            scrollVelocity = 0
            if (scrollFrame !== null) {
              cancelAnimationFrame(scrollFrame)
              scrollFrame = null
            }
          }

          const onMouseDown = (event: MouseEvent): void => {
            if (!canStart(event)) return
            origin = { x: event.clientX, y: event.clientY, below: belowContent(event.clientY) }
            pointer = { x: event.clientX, y: event.clientY }
            // Stops the browser from starting its own text selection, which
            // would drag across the title and icon above the editor. A plain
            // click below the content is restored on mouseup.
            event.preventDefault()
          }

          const onMouseMove = (event: MouseEvent): void => {
            if (!origin) return
            pointer = { x: event.clientX, y: event.clientY }

            if (!active) {
              const moved =
                Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y)
              if (moved < MARQUEE_THRESHOLD) return
              active = true
              marquee.classList.add('is-active')
              document.body.classList.add('is-selecting-blocks')
              // Drop any stray native selection begun before the threshold.
              window.getSelection()?.removeAllRanges()
            }

            updateEdgeScroll()
            if (scrollVelocity !== 0 && scrollFrame === null) {
              scrollFrame = requestAnimationFrame(stepScroll)
            }

            draw(pointer)
          }

          const finish = (): void => {
            const start = origin
            const wasActive = active
            origin = null
            stopEdgeScroll()

            if (wasActive) {
              active = false
              marquee.classList.remove('is-active')
              document.body.classList.remove('is-selecting-blocks')
              return
            }

            // A press that never became a marquee. `preventDefault` on mousedown
            // ate the native caret placement, so a click below the content is
            // restored here as focus at the document's end.
            if (start?.below) {
              const end = view.state.doc.content.size
              view.dispatch(
                view.state.tr.setSelection(TextSelection.create(view.state.doc, end))
              )
              view.focus()
            }
          }

          scrollHost.addEventListener('mousedown', onMouseDown)
          scrollHost.addEventListener('scroll', onScroll)
          window.addEventListener('mousemove', onMouseMove)
          window.addEventListener('mouseup', finish)

          return {
            destroy: () => {
              scrollHost.removeEventListener('mousedown', onMouseDown)
              scrollHost.removeEventListener('scroll', onScroll)
              window.removeEventListener('mousemove', onMouseMove)
              window.removeEventListener('mouseup', finish)
              stopEdgeScroll()
              document.body.classList.remove('is-selecting-blocks')
              marquee.remove()
            }
          }
        }
      })
    ]
  }
})
