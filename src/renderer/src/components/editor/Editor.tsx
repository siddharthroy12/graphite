import { useEffect } from 'react'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { FormattingMenu } from './FormattingMenu'
import { SlashCommand } from './slash-command'
import { BlockDragHandle } from './drag-handle'
import { BlockSelection } from './block-selection'

const lowlight = createLowlight(common)

interface EditorProps {
  /** Changes remount the editor with the new document. */
  pageId: string
  /** Serialized Tiptap JSON, or an empty string for a fresh page. */
  initialContent: string
  onChange(content: string, plainText: string): void
  /** Shift+Tab / Backspace at the very start moves focus back to the title. */
  onFocusTitle(): void
}

function parseContent(raw: string): JSONContent | string {
  if (!raw) return ''
  try {
    return JSON.parse(raw) as JSONContent
  } catch {
    // Older or hand-edited rows may hold plain text rather than JSON.
    return raw
  }
}

export function Editor({
  pageId,
  initialContent,
  onChange,
  onFocusTitle
}: EditorProps): React.JSX.Element {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // Replaced below with the syntax-highlighting version.
          codeBlock: false,
          heading: { levels: [1, 2, 3] },
          // The line showing where a dragged block will land. Set explicitly
          // rather than left to the 1px `currentColor` default, which is
          // nearly invisible against body text.
          dropcursor: { color: '#2f6fa8', width: 4, class: 'graphite-dropcursor' }
        }),
        CodeBlockLowlight.configure({ lowlight }),
        Underline,
        Highlight,
        TaskList,
        TaskItem.configure({ nested: true }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { rel: 'noopener noreferrer' }
        }),
        Placeholder.configure({
          placeholder: ({ node }) =>
            node.type.name === 'paragraph' ? "Write something, or press '/' for blocks" : '',
          showOnlyCurrent: true
        }),
        SlashCommand,
        BlockDragHandle,
        BlockSelection
      ],
      content: parseContent(initialContent),
      autofocus: false,
      editorProps: {
        attributes: {
          class: 'tiptap focus:outline-none',
          spellcheck: 'true'
        },
        handleKeyDown: (_view, event) => {
          if (event.key === 'Tab' && event.shiftKey) {
            // Only leave the editor when there's no list to outdent.
            const outdented =
              editor?.can().liftListItem('listItem') || editor?.can().liftListItem('taskItem')
            if (!outdented) {
              event.preventDefault()
              onFocusTitle()
              return true
            }
          }
          return false
        }
      },
      onUpdate: ({ editor: instance }) => {
        onChange(
          JSON.stringify(instance.getJSON()),
          instance.getText({ blockSeparator: '\n' })
        )
      }
    },
    // Remount for a different page so undo history never crosses documents.
    [pageId]
  )

  // Links are informational while editing; a click should reach the OS browser.
  useEffect(() => {
    const element = editor?.view.dom
    if (!element) return

    const handleClick = (event: MouseEvent): void => {
      const anchor = (event.target as HTMLElement | null)?.closest('a')
      const href = anchor?.getAttribute('href')
      if (!href) return

      // Plain clicks keep placing the caret; modifier-click opens the link.
      if (!event.metaKey && !event.ctrlKey) return

      event.preventDefault()
      void window.api.system.openExternal(href).catch(() => {
        /* Non-web links are rejected in the main process. */
      })
    }

    element.addEventListener('click', handleClick)
    return () => element.removeEventListener('click', handleClick)
  }, [editor])

  return (
    <div className="graphite-editor">
      {editor && <FormattingMenu editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
