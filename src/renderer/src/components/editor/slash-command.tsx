import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import {
  CheckSquare,
  ChevronRight,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Type,
  type LucideIcon
} from 'lucide-react'
import { SUBPAGE_NODE } from '@shared/subpage-block'
import { MEDIA_NODE } from '@shared/media'
import { pageIdFor, refreshTree } from './editor-registry'
import { SlashMenu, type SlashMenuHandle } from './SlashMenu'

export interface SlashItem {
  title: string
  description: string
  icon: LucideIcon
  /** Extra words that should match this item. */
  keywords: string[]
  command(props: { editor: Editor; range: Range }): void
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Text',
    description: 'Plain paragraph',
    icon: Type,
    keywords: ['paragraph', 'body', 'plain'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('paragraph').run()
  },
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: Heading1,
    keywords: ['h1', 'title', 'big'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: Heading2,
    keywords: ['h2', 'subtitle'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: Heading3,
    keywords: ['h3'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
  },
  {
    title: 'Bulleted list',
    description: 'A simple bulleted list',
    icon: List,
    keywords: ['ul', 'unordered', 'point'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
  },
  {
    title: 'Numbered list',
    description: 'A list with numbering',
    icon: ListOrdered,
    keywords: ['ol', 'ordered', 'number'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
  },
  {
    title: 'To-do list',
    description: 'Track tasks with checkboxes',
    icon: CheckSquare,
    keywords: ['todo', 'task', 'checkbox', 'check'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
  },
  {
    title: 'Quote',
    description: 'Capture a quotation',
    icon: Quote,
    keywords: ['blockquote', 'citation'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
  },
  {
    title: 'Code block',
    description: 'Syntax-highlighted code',
    icon: Code2,
    keywords: ['snippet', 'pre', 'monospace'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
  },
  {
    title: 'Image',
    description: 'Upload an image',
    icon: ImageIcon,
    keywords: ['picture', 'photo', 'png', 'jpg', 'gif'],
    command: ({ editor, range }) => insertImage(editor, range)
  },
  {
    title: 'Divider',
    description: 'Visually separate sections',
    icon: Minus,
    keywords: ['hr', 'rule', 'line', 'separator'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
  },
  {
    title: 'Page',
    description: 'Embed a subpage',
    icon: FileText,
    keywords: ['subpage', 'child', 'page', 'link'],
    command: ({ editor, range }) => {
      // Creates the subpage first so the block has a real page to point at.
      // Stays on the current page; the sidebar refreshes via the registry.
      const pageId = pageIdFor(editor)
      if (!pageId) return
      void window.api.pages.create({ parentId: pageId }).then((page) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: SUBPAGE_NODE, attrs: { pageId: page.id } })
          .run()
        refreshTree()
      })
    }
  },
  {
    title: 'Toggle heading',
    description: 'Collapse-style heading 3',
    icon: ChevronRight,
    keywords: ['collapse', 'details'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
  }
]

/** Drops in an empty image block; its node view prompts for the upload. */
function insertImage(editor: Editor, range: Range): void {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({ type: MEDIA_NODE, attrs: { kind: 'image' } })
    .run()
}

function filterItems(query: string): SlashItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return SLASH_ITEMS

  return SLASH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      item.keywords.some((keyword) => keyword.includes(needle))
  )
}

const suggestionOptions: Omit<SuggestionOptions<SlashItem>, 'editor'> = {
  char: '/',
  // Only trigger at the start of an empty-ish block, like Notion does.
  startOfLine: false,
  allowSpaces: false,

  items: ({ query }) => filterItems(query),

  command: ({ editor, range, props }) => {
    props.command({ editor, range })
  },

  render: () => {
    let component: ReactRenderer<SlashMenuHandle> | null = null
    let popup: TippyInstance | null = null

    return {
      onStart: (props) => {
        component = new ReactRenderer(SlashMenu, {
          props,
          editor: props.editor
        })

        if (!props.clientRect) return

        popup = tippy(document.body, {
          getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          maxWidth: 'none'
        })
      },

      onUpdate: (props) => {
        component?.updateProps(props)
        if (!props.clientRect) return
        popup?.setProps({
          getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect()
        })
      },

      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          popup?.hide()
          return true
        }
        return component?.ref?.onKeyDown(props) ?? false
      },

      onExit: () => {
        popup?.destroy()
        component?.destroy()
        popup = null
        component = null
      }
    }
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...suggestionOptions })]
  }
})
