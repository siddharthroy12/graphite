import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Notion-style block controls: a grip that drags a block to a new position and
 * a `+` that inserts a paragraph below it.
 *
 * Tiptap v2's own drag handle is a paid Pro extension, so this drives
 * ProseMirror's built-in drag machinery directly: on `dragstart` we put a
 * `NodeSelection` on the hovered block and hand its slice to `view.dragging`,
 * which lets ProseMirror render the drop cursor and perform the move.
 */

/** Nodes that get their own handle rather than deferring to their container. */
const ITEM_NODES = new Set(['listItem', 'taskItem'])

/** Horizontal gap between the controls and the block they belong to. */
const GUTTER_OFFSET = 50
const HANDLE_SIZE = 22

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

function resolveTarget(view: EditorView, clientY: number): HoverTarget | null {
  const editorRect = view.dom.getBoundingClientRect()
  // The editor's left padding is the drag-handle gutter; probing inside it
  // would sample empty space rather than the block's text.
  const gutter = parseFloat(window.getComputedStyle(view.dom).paddingLeft) || 0

  // The pointer is usually in that gutter, so probe at the start of the text
  // at the pointer's height instead of at the pointer's own x.
  const found = view.posAtCoords({ left: editorRect.left + gutter + 8, top: clientY })
  if (!found) return null

  // `found.pos` sits inside the block; `found.inside` is the position *before*
  // the containing node, which resolves to depth 0 for a top-level block.
  const $pos = view.state.doc.resolve(found.pos)

  let pos: number
  let isItem = false

  if ($pos.depth === 0) {
    if (found.inside < 0) return null
    pos = found.inside
  } else {
    // Innermost list item wins, so each bullet is its own handle; otherwise
    // fall back to the top-level block at depth 1.
    let depth = 1
    for (let d = $pos.depth; d >= 1; d--) {
      if (ITEM_NODES.has($pos.node(d).type.name)) {
        depth = d
        isItem = true
        break
      }
    }
    pos = $pos.before(depth)
  }

  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null

  return { pos, isItem, dom }
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
          let dragging = false
          /** Pointer row the controls currently belong to. */
          let lastClientY: number | null = null
          /**
           * Set while the pointer is held on the grip. The browser emits
           * mousemove before `dragstart`, so without this the few pixels of
           * travel that begin a drag would retarget the handle and move a
           * different block than the one grabbed.
           */
          let locked = false

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
          grip.draggable = true
          grip.title = 'Drag to move'
          grip.setAttribute('aria-label', 'Drag to move block')
          grip.innerHTML =
            '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>'

          controls.append(addButton, grip)
          wrapper.appendChild(controls)

          const hide = (): void => {
            if (dragging) return
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

            controls.style.top = `${blockRect.top - wrapperRect.top + offset}px`
            controls.style.left = `${blockRect.left - wrapperRect.left - GUTTER_OFFSET}px`
            controls.classList.add('is-visible')
          }

          /** Re-resolves the block under the last known pointer row. */
          const refresh = (): void => {
            if (dragging || locked || lastClientY === null) return
            const next = resolveTarget(view, lastClientY)
            if (next) position(next)
            else hide()
          }

          const onMouseMove = (event: MouseEvent): void => {
            if (dragging || locked || !view.editable) return
            lastClientY = event.clientY
            refresh()
          }

          const onMouseLeave = (event: MouseEvent): void => {
            // Moving onto the controls themselves must not dismiss them.
            const to = event.relatedTarget
            if (to instanceof Node && controls.contains(to)) return
            hide()
          }

          const onDragStart = (event: DragEvent): void => {
            if (!target || !event.dataTransfer) return
            dragging = true

            // Must precede the dispatch below: the selection styling would
            // otherwise be applied before the drag image is snapshotted.
            wrapper.classList.add('is-block-dragging')

            const selection = NodeSelection.create(view.state.doc, target.pos)
            view.dispatch(view.state.tr.setSelection(selection))

            const slice = view.state.selection.content()
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.clearData()
            // Chromium aborts a drag that carries no data, so send the block's
            // text — it also makes dropping into another app do something sane.
            event.dataTransfer.setData('text/plain', target.dom.textContent ?? ' ')
            event.dataTransfer.setDragImage(target.dom, 0, 0)

            // Handing the slice to ProseMirror gives us its drop cursor and
            // its handling of the drop itself.
            view.dragging = { slice, move: true }

            // Hiding the drag source *during* `dragstart` cancels the drag in
            // Chromium (dragend fires immediately, no dragover/drop), so this
            // has to wait until after the handler returns.
            setTimeout(() => controls.classList.remove('is-visible'), 0)
          }

          const onDragEnd = (): void => {
            dragging = false
            locked = false
            view.dragging = null
            wrapper.classList.remove('is-block-dragging')
          }

          const onGripMouseDown = (): void => {
            locked = true
          }

          // A press that never became a drag must not leave the handle stuck.
          const onWindowMouseUp = (): void => {
            if (!dragging) locked = false
          }

          const onGripClick = (): void => {
            if (!target) return
            view.dispatch(
              view.state.tr.setSelection(NodeSelection.create(view.state.doc, target.pos))
            )
            view.focus()
          }

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
          // The grip must not do this, or the browser won't start a drag.
          addButton.addEventListener('mousedown', (event) => event.preventDefault())

          hoverArea.addEventListener('mousemove', onMouseMove)
          hoverArea.addEventListener('mouseleave', onMouseLeave)
          grip.addEventListener('mousedown', onGripMouseDown)
          window.addEventListener('mouseup', onWindowMouseUp)
          grip.addEventListener('dragstart', onDragStart)
          grip.addEventListener('dragend', onDragEnd)
          grip.addEventListener('click', onGripClick)
          addButton.addEventListener('click', onAddClick)

          return {
            update: () => {
              // The document may have shifted under the pointer, so re-resolve
              // rather than hiding: blurring the editor to click the grip is
              // itself a transaction, and hiding here would pull the control
              // out from under the click.
              if (!dragging && target) refresh()
            },
            destroy: () => {
              hoverArea.removeEventListener('mousemove', onMouseMove)
              hoverArea.removeEventListener('mouseleave', onMouseLeave)
              grip.removeEventListener('mousedown', onGripMouseDown)
              window.removeEventListener('mouseup', onWindowMouseUp)
              grip.removeEventListener('dragstart', onDragStart)
              grip.removeEventListener('dragend', onDragEnd)
              grip.removeEventListener('click', onGripClick)
              addButton.removeEventListener('click', onAddClick)
              wrapper.classList.remove('is-block-dragging')
              controls.remove()
            }
          }
        }
      })
    ]
  }
})
