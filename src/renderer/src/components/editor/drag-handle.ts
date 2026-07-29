import { Extension } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { dropPoint } from '@tiptap/pm/transform'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Notion-style block controls: a grip that drags a block to a new position and
 * a `+` that opens the block menu below it.
 *
 * Dragging is driven by pointer events rather than HTML5 drag-and-drop. Native
 * DnD would hand us ProseMirror's drop handling for free, but the browser owns
 * the cursor for the duration of a native drag and takes it from `dropEffect`,
 * so a grab cursor is impossible. Owning the gesture means we also draw the
 * drop indicator and perform the move ourselves.
 */

/** Nodes that get their own handle rather than deferring to their container. */
const ITEM_NODES = new Set(['listItem', 'taskItem'])

/** Horizontal gap between the controls and the block they belong to. */
const GUTTER_OFFSET = 50
const HANDLE_SIZE = 22
/** Pointer travel before a press becomes a drag, so clicks still register. */
const DRAG_THRESHOLD = 4

interface HoverTarget {
  /**
   * Node the grip drags. List and to-do items get their own handle so they
   * move individually; anything else defers to its top-level block.
   */
  pos: number
  /** True when `pos` is a list/to-do item rather than a top-level block. */
  isItem: boolean
  dom: HTMLElement
}

/** Where a release would insert, and the y to draw the indicator at. */
interface DropSpot {
  pos: number
  y: number
}

const isList = (el: Element): boolean => el.tagName === 'UL' || el.tagName === 'OL'

const spans = (el: Element, clientY: number): boolean => {
  const rect = el.getBoundingClientRect()
  return clientY >= rect.top && clientY <= rect.bottom
}

/**
 * The child whose row contains `clientY`, or — failing that — whichever child
 * is vertically nearest. List rows sit `--block-gap` apart (a flex `gap`,
 * which leaves a real dead strip between the rows' own boxes, not just
 * touching edges), so a pointer resting exactly in that gap contains no
 * child's rect at all. Falling back to distance instead of giving up there
 * is what keeps a row assigned even inside the gap.
 */
function closestChild(children: Element[], clientY: number): Element | undefined {
  const contained = children.find((el) => spans(el, clientY))
  if (contained) return contained
  if (children.length === 0) return undefined

  const distanceTo = (el: Element): number => {
    const rect = el.getBoundingClientRect()
    if (clientY < rect.top) return rect.top - clientY
    if (clientY > rect.bottom) return clientY - rect.bottom
    return 0
  }

  return children.reduce((nearest, el) => (distanceTo(el) < distanceTo(nearest) ? el : nearest))
}

/**
 * The block-level element under `clientY`, descending into list items so each
 * one gets its own handle at any nesting depth.
 *
 * This hit-tests the DOM by row rather than asking `posAtCoords` for a point:
 * a probe x has to be guessed, and any guess lands in empty space for some
 * block (a list's bullet gutter, an empty paragraph), which resolves to a
 * neighbouring block and makes the handle jump between rows.
 */
function blockElementAt(view: EditorView, clientY: number): HTMLElement | null {
  const first = closestChild(Array.from(view.dom.children), clientY)
  if (!first) return null

  let el: Element = first
  while (isList(el)) {
    const item = closestChild(Array.from(el.children), clientY)
    if (!item) break
    // Keep descending only if a nested list — not the item's own text — is
    // what sits under the pointer. Strict containment here (not "nearest"):
    // a nested list is small relative to its parent item, so it should only
    // take over when the pointer is genuinely inside it.
    const nested: Element | undefined = Array.from(item.children).find(
      (child) => isList(child) && spans(child, clientY)
    )
    if (!nested) {
      el = item
      break
    }
    el = nested
  }

  return el instanceof HTMLElement ? el : null
}

function nodePosOf(view: EditorView, dom: HTMLElement): number | null {
  try {
    // `posAtDOM(el, 0)` lands just inside the node; step back to the node.
    return view.posAtDOM(dom, 0) - 1
  } catch {
    return null
  }
}

function resolveTarget(view: EditorView, clientY: number): HoverTarget | null {
  const dom = blockElementAt(view, clientY)
  if (!dom) return null

  const pos = nodePosOf(view, dom)
  if (pos === null) return null

  const node = view.state.doc.nodeAt(pos)
  if (!node) return null

  return { pos, isItem: ITEM_NODES.has(node.type.name), dom }
}

/** The gap nearest the pointer: above the hovered row, or below it. */
function dropSpotAt(view: EditorView, clientY: number): DropSpot | null {
  const dom = blockElementAt(view, clientY)
  if (!dom) return null

  const pos = nodePosOf(view, dom)
  if (pos === null) return null

  const node = view.state.doc.nodeAt(pos)
  if (!node) return null

  const rect = dom.getBoundingClientRect()
  const above = clientY < rect.top + rect.height / 2

  // Draw in the middle of the gap between the two blocks. "Below A" and
  // "above B" are the same insertion point, so anchoring to A's bottom edge
  // for one and B's top edge for the other would show a single drop location
  // at two different heights as the pointer crosses the gap.
  const neighbour = above ? dom.previousElementSibling : dom.nextElementSibling
  let y: number
  if (neighbour) {
    const gap = neighbour.getBoundingClientRect()
    y = above ? (gap.bottom + rect.top) / 2 : (rect.bottom + gap.top) / 2
  } else {
    y = above ? rect.top : rect.bottom
  }

  return { pos: above ? pos : pos + node.nodeSize, y }
}

export const BlockDragHandle = Extension.create({
  name: 'blockDragHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockDragHandle'),

        view: (view) => {
          // `view.dom.parentElement` is EditorContent's own div; the positioned
          // ancestor the controls are placed against is `.graphite-editor`.
          const wrapper = view.dom.closest<HTMLElement>('.graphite-editor')
          if (!wrapper) return {}

          // `.graphite-editor` is padded left over the gutter (see index.css),
          // so the controls and the space around them are inside this element
          // and the pointer can reach them without leaving the hover region.
          const hoverArea = wrapper

          let target: HoverTarget | null = null
          /** Pointer row the controls currently belong to. */
          let lastClientY: number | null = null

          /** Set between mousedown on the grip and mouseup. */
          let pressed: { x: number; y: number; target: HoverTarget } | null = null
          /** True once the press has passed the movement threshold. */
          let dragging = false
          let dropSpot: DropSpot | null = null

          const controls = document.createElement('div')
          controls.className = 'block-controls'
          controls.setAttribute('contenteditable', 'false')

          const addButton = document.createElement('button')
          addButton.type = 'button'
          addButton.className = 'block-control'
          addButton.title = 'Add a block below'
          addButton.setAttribute('aria-label', 'Add a block below')
          addButton.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'

          const grip = document.createElement('button')
          grip.type = 'button'
          grip.className = 'block-control block-grip'
          grip.title = 'Drag to move'
          grip.setAttribute('aria-label', 'Drag to move block')
          grip.innerHTML =
            '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>'

          controls.append(addButton, grip)

          const indicator = document.createElement('div')
          indicator.className = 'block-drop-indicator'
          indicator.setAttribute('contenteditable', 'false')

          // These live outside the editor's own DOM, so they survive if an
          // editor instance goes away without its plugin view being destroyed
          // — a hot reload, or a re-created editor. Clearing strays keeps
          // exactly one set per editor instead of leaving orphans behind.
          for (const stale of wrapper.querySelectorAll(
            '.block-controls, .block-drop-indicator'
          )) {
            stale.remove()
          }
          wrapper.append(controls, indicator)

          /* ------------------------------------------------------------ */
          /* Hover                                                        */
          /* ------------------------------------------------------------ */

          const hide = (): void => {
            if (pressed) return
            controls.classList.remove('is-visible')
            target = null
            lastClientY = null
          }

          const position = (next: HoverTarget): void => {
            target = next
            const wrapperRect = wrapper.getBoundingClientRect()
            const blockRect = next.dom.getBoundingClientRect()
            const style = window.getComputedStyle(next.dom)

            // Line the controls up with the block's first line, not its middle,
            // so tall blocks and large headings both look right.
            const paddingTop = parseFloat(style.paddingTop) || 0
            const lineHeight = parseFloat(style.lineHeight) || 24
            const offset = paddingTop + Math.max(0, (lineHeight - HANDLE_SIZE) / 2)

            // Fixed column in the gutter. Anchoring to the block's own left
            // edge instead would push the handle right on an indented list
            // item — over the content — and make it jump sideways as the
            // pointer crosses between nested and top-level blocks.
            const editorRect = view.dom.getBoundingClientRect()
            const gutter = parseFloat(window.getComputedStyle(view.dom).paddingLeft) || 0

            controls.style.top = `${blockRect.top - wrapperRect.top + offset}px`
            controls.style.left = `${editorRect.left - wrapperRect.left + gutter - GUTTER_OFFSET}px`
            controls.classList.add('is-visible')
          }

          const refresh = (): void => {
            if (pressed || lastClientY === null) return
            const next = resolveTarget(view, lastClientY)
            if (next) position(next)
            else hide()
          }

          const onMouseMove = (event: MouseEvent): void => {
            if (pressed || !view.editable) return
            lastClientY = event.clientY
            refresh()
          }

          const onMouseLeave = (event: MouseEvent): void => {
            // Moving onto the controls themselves must not dismiss them.
            const to = event.relatedTarget
            if (to instanceof Node && controls.contains(to)) return
            hide()
          }

          /* ------------------------------------------------------------ */
          /* Dragging                                                     */
          /* ------------------------------------------------------------ */

          const showIndicator = (spot: DropSpot): void => {
            const wrapperRect = wrapper.getBoundingClientRect()
            const editorRect = view.dom.getBoundingClientRect()
            const gutter = parseFloat(window.getComputedStyle(view.dom).paddingLeft) || 0

            indicator.style.top = `${spot.y - wrapperRect.top - 2}px`
            indicator.style.left = `${editorRect.left - wrapperRect.left + gutter}px`
            indicator.style.width = `${editorRect.width - gutter}px`
            indicator.classList.add('is-visible')
          }

          const endDrag = (): void => {
            pressed = null
            dragging = false
            dropSpot = null
            indicator.classList.remove('is-visible')
            document.body.classList.remove('is-dragging-block')
            wrapper.classList.remove('is-block-dragging')
          }

          /** Moves the pressed block to `spot`, keeping the document valid. */
          const commitDrop = (spot: DropSpot, from: number): void => {
            const { state } = view
            const node = state.doc.nodeAt(from)
            if (!node) return

            const to = from + node.nodeSize
            // Dropping inside the block being moved is a no-op, not a move.
            if (spot.pos >= from && spot.pos <= to) return

            const slice = new Slice(Fragment.from(node), 0, 0)
            let tr = state.tr.delete(from, to)

            const mapped = tr.mapping.map(spot.pos)
            // `dropPoint` finds the nearest position the slice actually fits,
            // so a list item dropped between paragraphs lands somewhere legal
            // instead of throwing.
            const point = dropPoint(tr.doc, mapped, slice)
            if (point === null || point === undefined) return

            tr = tr.replace(point, point, slice)

            const $at = tr.doc.resolve(point)
            const landed = $at.nodeAfter
            if (landed) {
              tr = tr.setSelection(NodeSelection.create(tr.doc, point))
            }

            view.dispatch(tr.scrollIntoView())
          }

          const onGripMouseDown = (event: MouseEvent): void => {
            if (event.button !== 0 || !target) return
            // Keeps the press from selecting text or blurring the editor.
            event.preventDefault()
            pressed = { x: event.clientX, y: event.clientY, target }
          }

          const onWindowMouseMove = (event: MouseEvent): void => {
            if (!pressed) return

            if (!dragging) {
              const moved =
                Math.abs(event.clientX - pressed.x) + Math.abs(event.clientY - pressed.y)
              if (moved < DRAG_THRESHOLD) return
              dragging = true
              document.body.classList.add('is-dragging-block')
              wrapper.classList.add('is-block-dragging')
              controls.classList.remove('is-visible')
              view.dispatch(
                view.state.tr.setSelection(
                  NodeSelection.create(view.state.doc, pressed.target.pos)
                )
              )
            }

            dropSpot = dropSpotAt(view, event.clientY)
            if (dropSpot) showIndicator(dropSpot)
            else indicator.classList.remove('is-visible')
          }

          const onWindowMouseUp = (): void => {
            if (!pressed) return
            const { target: dragged } = pressed
            const spot = dropSpot
            const wasDragging = dragging

            endDrag()

            if (wasDragging && spot) commitDrop(spot, dragged.pos)
            else if (!wasDragging) {
              // A press that never moved is a click: select the block.
              view.dispatch(
                view.state.tr.setSelection(
                  NodeSelection.create(view.state.doc, dragged.pos)
                )
              )
              view.focus()
            }
          }

          const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && pressed) endDrag()
          }

          /* ------------------------------------------------------------ */
          /* Adding blocks                                                */
          /* ------------------------------------------------------------ */

          /**
           * Opens the block picker on a fresh block below the hovered one.
           *
           * The picker is the `/` suggestion plugin, so rather than duplicating
           * its list this puts the caret on an empty block and types the `/`
           * for the user — one implementation of the menu, and the typed and
           * clicked routes can't drift apart.
           */
          const onAddClick = (): void => {
            if (!target) return
            const { state } = view
            const node = state.doc.nodeAt(target.pos)
            if (!node) return

            // Beside a list item, `+` belongs to that item — it adds the next
            // bullet, rather than skipping past the whole list.
            // The caret sits one level deeper for an item (li > paragraph).
            const innerDepth = target.isItem ? 2 : 1

            // Reuse the hovered block when it's already empty, so clicking `+`
            // on a blank line doesn't leave one stranded.
            const reusable = node.content.size === 0 || node.textContent === ''

            let caret: number
            if (reusable) {
              caret = target.pos + innerDepth
              view.dispatch(
                state.tr.setSelection(TextSelection.near(state.doc.resolve(caret)))
              )
            } else {
              // Same node type for an item, so a bullet begets a bullet and a
              // to-do begets a to-do.
              const fresh = target.isItem
                ? node.type.createAndFill()
                : state.schema.nodes.paragraph.createAndFill()
              if (!fresh) return

              const insertAt = target.pos + node.nodeSize
              const tr = state.tr.insert(insertAt, fresh)
              caret = insertAt + innerDepth
              tr.setSelection(TextSelection.near(tr.doc.resolve(caret)))
              view.dispatch(tr.scrollIntoView())
            }

            view.focus()
            // Dispatched separately: the suggestion plugin matches against the
            // state left by the transaction before it.
            view.dispatch(view.state.tr.insertText('/'))
            hide()
          }

          // Keeps the editor focused (and the caret put) when `+` is pressed.
          addButton.addEventListener('mousedown', (event) => event.preventDefault())
          addButton.addEventListener('click', onAddClick)

          grip.addEventListener('mousedown', onGripMouseDown)
          hoverArea.addEventListener('mousemove', onMouseMove)
          hoverArea.addEventListener('mouseleave', onMouseLeave)
          window.addEventListener('mousemove', onWindowMouseMove)
          window.addEventListener('mouseup', onWindowMouseUp)
          window.addEventListener('keydown', onKeyDown)

          return {
            update: () => {
              // The document may have shifted under the pointer, so re-resolve
              // rather than hiding: blurring the editor to click the grip is
              // itself a transaction, and hiding here would pull the control
              // out from under the click.
              if (!pressed && target) refresh()
            },
            destroy: () => {
              addButton.removeEventListener('click', onAddClick)
              grip.removeEventListener('mousedown', onGripMouseDown)
              hoverArea.removeEventListener('mousemove', onMouseMove)
              hoverArea.removeEventListener('mouseleave', onMouseLeave)
              window.removeEventListener('mousemove', onWindowMouseMove)
              window.removeEventListener('mouseup', onWindowMouseUp)
              window.removeEventListener('keydown', onKeyDown)
              document.body.classList.remove('is-dragging-block')
              wrapper.classList.remove('is-block-dragging')
              controls.remove()
              indicator.remove()
            }
          }
        }
      })
    ]
  }
})
