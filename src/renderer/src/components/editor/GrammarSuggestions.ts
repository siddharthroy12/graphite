import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { checkText } from './grammar'

/**
 * On-device grammar suggestions. Every text run is scanned by the rules in
 * grammar.ts; each issue gets a wavy underline, and clicking it opens a small
 * popup offering the one-click fix. Nothing leaves the machine.
 *
 * The matches carry their replacement on the decoration itself, so the click
 * handler can look up the exact range and fix from the decoration set rather
 * than re-parsing the DOM.
 */

const key = new PluginKey<DecorationSet>('grammarSuggestions')

interface GrammarSpec {
  grammar: true
  message: string
  replacement: string
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const match of checkText(node.text)) {
      const spec: GrammarSpec = {
        grammar: true,
        message: match.message,
        replacement: match.replacement
      }
      decorations.push(
        Decoration.inline(pos + match.from, pos + match.to, { class: 'grammar-issue' }, spec)
      )
    }
  })
  return DecorationSet.create(doc, decorations)
}

export const GrammarSuggestions = Extension.create({
  name: 'grammarSuggestions',

  addProseMirrorPlugins() {
    // Set by the plugin view once the editor DOM exists; called from the click
    // handler, which only fires afterwards.
    let openPopup: (from: number, to: number, spec: GrammarSpec) => void = () => {}

    return [
      new Plugin<DecorationSet>({
        key,

        state: {
          init: (_config, { doc }) => buildDecorations(doc),
          apply: (tr, current) => (tr.docChanged ? buildDecorations(tr.doc) : current)
        },

        props: {
          decorations: (state) => key.getState(state),

          handleClick: (view, pos) => {
            const found = key
              .getState(view.state)
              ?.find(pos, pos)
              .find((deco) => (deco.spec as GrammarSpec | undefined)?.grammar)
            if (!found) return false
            openPopup(found.from, found.to, found.spec as GrammarSpec)
            // Swallow the click so it opens the popup instead of just moving the
            // caret (which would fire a transaction and close the popup again).
            return true
          }
        },

        view: (view: EditorView) => {
          const wrapper = view.dom.closest<HTMLElement>('.graphite-editor')
          if (!wrapper) return {}

          const popup = document.createElement('div')
          popup.className = 'grammar-popup'
          popup.setAttribute('contenteditable', 'false')
          for (const stale of wrapper.querySelectorAll('.grammar-popup')) stale.remove()
          wrapper.appendChild(popup)

          let range: { from: number; to: number } | null = null

          const hide = (): void => {
            range = null
            popup.classList.remove('is-visible')
          }

          openPopup = (from, to, spec): void => {
            range = { from, to }
            popup.replaceChildren()

            const message = document.createElement('span')
            message.className = 'grammar-popup-message'
            message.textContent = spec.message

            const fix = document.createElement('button')
            fix.type = 'button'
            fix.className = 'grammar-popup-fix'
            fix.textContent =
              spec.replacement.trim() === '' ? 'Fix spacing' : `Change to "${spec.replacement}"`
            // Keep the press from blurring the editor before the click lands.
            fix.addEventListener('mousedown', (event) => event.preventDefault())
            fix.addEventListener('click', () => {
              if (!range) return
              view.dispatch(view.state.tr.insertText(spec.replacement, range.from, range.to))
              hide()
              view.focus()
            })

            popup.append(message, fix)

            const coords = view.coordsAtPos(from)
            const wrapperRect = wrapper.getBoundingClientRect()
            popup.style.top = `${coords.bottom - wrapperRect.top + 4}px`
            popup.style.left = `${coords.left - wrapperRect.left}px`
            popup.classList.add('is-visible')
          }

          // A click anywhere but the popup (or another issue) dismisses it.
          const onPointerDown = (event: MouseEvent): void => {
            const target = event.target
            if (!(target instanceof Node)) return
            if (popup.contains(target)) return
            if (target instanceof Element && target.closest('.grammar-issue')) return
            hide()
          }
          document.addEventListener('mousedown', onPointerDown, true)

          return {
            update: (updatedView, prevState) => {
              // Any edit shifts positions and can dissolve the match; drop the
              // popup rather than leave it pointing at a stale range.
              if (range && updatedView.state.doc !== prevState.doc) hide()
            },
            destroy: () => {
              document.removeEventListener('mousedown', onPointerDown, true)
              popup.remove()
              openPopup = () => {}
            }
          }
        }
      })
    ]
  }
})
