import { Node, mergeAttributes } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

export const TOGGLE_HEADING_NODE = 'toggleHeading'

const CHEVRON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'

/**
 * A collapsible heading. Its first child is a real `heading` node — so it draws
 * at the h1/h2/h3 size for its level, and markdown/slash creation reuse the
 * heading machinery — followed by any number of nested blocks that indent under
 * it and hide when collapsed. The content model `heading block*` is what makes
 * editing feel native: pressing Enter at the end of the summary runs the usual
 * `splitBlock`, which lands a fresh paragraph as the toggle's first nested
 * child rather than escaping the block. `isolating` keeps deletes and joins
 * from silently merging the toggle into its neighbours.
 *
 * `open` is stored on the node (so a collapsed toggle stays collapsed across
 * reloads) and rendered as `data-open`; the CSS in index.css hides the nested
 * blocks when it's false. `data-level` mirrors the summary heading's level so
 * the chevron can be centred on its first line.
 *
 * The node view is a plain ProseMirror one, not a React `NodeViewContent`: that
 * wraps the content in an extra element, which would put a layer between
 * `.toggle-heading-body` and the actual blocks and break both the indentation
 * CSS and the drag handle's per-block descent (both expect the blocks to be
 * direct children of the body).
 */
export const ToggleHeading = Node.create({
  name: TOGGLE_HEADING_NODE,

  group: 'block',
  content: 'heading block*',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-open') !== 'false',
        renderHTML: (attributes) => ({ 'data-open': attributes.open ? 'true' : 'false' })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle-heading"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'toggle-heading' }), 0]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.className = 'toggle-heading'

      const sync = (current: typeof node): void => {
        dom.dataset.open = current.attrs.open ? 'true' : 'false'
        dom.dataset.level = String((current.firstChild?.attrs.level as number | undefined) ?? 3)
      }

      const chevron = document.createElement('button')
      chevron.type = 'button'
      chevron.className = 'toggle-heading-chevron'
      chevron.contentEditable = 'false'
      chevron.setAttribute('aria-label', 'Toggle')
      chevron.innerHTML = CHEVRON_SVG
      // Don't move the selection or start a block drag when toggling.
      chevron.addEventListener('mousedown', (event) => event.preventDefault())
      chevron.addEventListener('click', () => {
        if (typeof getPos !== 'function') return
        const pos = getPos()
        if (pos == null) return
        const current = editor.state.doc.nodeAt(pos)
        if (!current) return
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeAttribute(pos, 'open', !current.attrs.open)
            return true
          })
          .run()
      })

      const contentDOM = document.createElement('div')
      contentDOM.className = 'toggle-heading-body'

      dom.append(chevron, contentDOM)
      sync(node)

      return {
        dom,
        contentDOM,
        update: (updated) => {
          if (updated.type.name !== TOGGLE_HEADING_NODE) return false
          sync(updated)
          return true
        }
      }
    }
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the very start of the summary unwraps the toggle: its
      // heading and nested blocks are lifted out to the top level, turning a
      // toggle back into a plain heading followed by its content. Without this
      // an `isolating` node has no keyboard way out.
      Backspace: () => {
        const { selection } = this.editor.state
        if (!selection.empty) return false
        const { $from } = selection
        if ($from.parentOffset !== 0 || $from.parent.type.name !== 'heading') return false
        const toggle = $from.depth >= 1 ? $from.node($from.depth - 1) : null
        if (!toggle || toggle.type.name !== this.name) return false
        if ($from.index($from.depth - 1) !== 0) return false

        const start = $from.before($from.depth - 1)
        return this.editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            tr.replaceWith(start, start + toggle.nodeSize, toggle.content)
            tr.setSelection(TextSelection.create(tr.doc, start + 1))
          }
          return true
        })
      },

      // Enter on an empty last nested block exits the toggle, dropping a fresh
      // paragraph after it — otherwise there's no way to stop typing inside.
      Enter: () => {
        const { selection } = this.editor.state
        if (!selection.empty) return false
        const { $from } = selection
        if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false
        const toggle = $from.depth >= 1 ? $from.node($from.depth - 1) : null
        if (!toggle || toggle.type.name !== this.name) return false
        if ($from.index($from.depth - 1) !== toggle.childCount - 1) return false

        const paraStart = $from.before($from.depth)
        const paraEnd = $from.after($from.depth)
        const afterToggle = $from.after($from.depth - 1)
        return this.editor.commands.command(({ tr, state, dispatch }) => {
          if (dispatch) {
            const paragraph = state.schema.nodes.paragraph.createAndFill()
            if (!paragraph) return false
            tr.delete(paraStart, paraEnd)
            const insertAt = afterToggle - (paraEnd - paraStart)
            tr.insert(insertAt, paragraph)
            tr.setSelection(TextSelection.create(tr.doc, insertAt + 1))
          }
          return true
        })
      }
    }
  }
})
