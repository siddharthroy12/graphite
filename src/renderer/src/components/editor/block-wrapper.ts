import { mergeAttributes } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import HorizontalRule from '@tiptap/extension-horizontal-rule'

/**
 * Blocks that carry their own tag-specific padding — a heading's top space, a
 * blockquote's rule and indent — render inside an extra `<div class="block-wrap">`
 * so the uniform 5px block padding can live on the wrapper without fighting
 * that tag styling. Only `renderHTML` is touched; each node keeps its tag,
 * attributes and content hole, nested one level deeper. `parseHTML` is left
 * alone, so loading a stored document or pasting external HTML — neither of
 * which produces a `.block-wrap` div — still resolves to the right node.
 *
 * Paragraphs and lists are deliberately *not* here. A paragraph is padded
 * directly (`.tiptap > p` in index.css) so its `is-empty` placeholder and its
 * selection tint land on the `<p>` itself rather than on a wrapper — ProseMirror
 * puts node decorations on a node's outermost element, and a wrapper would
 * steal them. A list's selectable unit is each item, not the list as a whole,
 * so the padding lives on the `<li>` (a `block-wrap` class added through the
 * list-item HTMLAttributes) — a wrapper around the whole `<ul>`/`<ol>` would
 * be the wrong element, and one between the list and its `<li>`s is invalid
 * HTML besides.
 */

export const WrappedHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level)
    const level = hasLevel ? node.attrs.level : this.options.levels[0]
    return [
      'div',
      { class: 'block-wrap' },
      [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    ]
  }
})

export const WrappedBlockquote = Blockquote.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { class: 'block-wrap' },
      ['blockquote', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    ]
  }
})

export const WrappedHorizontalRule = HorizontalRule.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { class: 'block-wrap' },
      ['hr', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
    ]
  }
})
