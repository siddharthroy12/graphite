import { mergeAttributes } from '@tiptap/core'
import Paragraph from '@tiptap/extension-paragraph'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import TaskList from '@tiptap/extension-task-list'

/**
 * Every block below renders inside an extra `<div class="block-wrap">`,
 * styled with a uniform 5px padding in index.css. Only `renderHTML` is
 * touched — each node keeps its original tag, attributes and content hole,
 * just nested one level deeper. `parseHTML` is untouched, so loading a
 * stored document or pasting HTML from outside — neither of which ever
 * produces a `.block-wrap` div — still resolves to the right node; the
 * wrapper only ever appears on output.
 *
 * List items get no override here, unlike every other block: a `<div>`
 * between `<ul>`/`<ol>` and `<li>` is invalid HTML (a list's only valid
 * children are its `<li>`s), so they keep their own un-wrapped padding.
 * Code blocks, media and subpages are unaffected too — they already render
 * through their own React node views with their own considered padding, not
 * through the renderHTML path this file customises.
 */

export const WrappedParagraph = Paragraph.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { class: 'block-wrap' },
      ['p', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    ]
  }
})

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

export const WrappedBulletList = BulletList.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { class: 'block-wrap' },
      ['ul', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    ]
  }
})

export const WrappedOrderedList = OrderedList.extend({
  renderHTML({ HTMLAttributes }) {
    // A list starting at 1 doesn't render a redundant `start="1"` — matches
    // the base extension's own renderHTML exactly, just nested one deeper.
    const { start, ...attributesWithoutStart } = HTMLAttributes
    const ol =
      start === 1
        ? ['ol', mergeAttributes(this.options.HTMLAttributes, attributesWithoutStart), 0]
        : ['ol', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    return ['div', { class: 'block-wrap' }, ol]
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

export const WrappedTaskList = TaskList.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { class: 'block-wrap' },
      ['ul', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': this.name }), 0]
    ]
  }
})
