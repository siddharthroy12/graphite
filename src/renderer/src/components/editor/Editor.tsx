import { useEffect } from 'react'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TaskItem from '@tiptap/extension-task-item'
import { CodeBlock, lowlight } from './CodeBlock'
import { MediaBlock } from './MediaBlock'
import { SubpageBlock } from './SubpageBlock'
import {
  WrappedParagraph,
  WrappedHeading,
  WrappedBlockquote,
  WrappedBulletList,
  WrappedOrderedList,
  WrappedHorizontalRule,
  WrappedTaskList
} from './block-wrapper'
import { registerEditor, unregisterEditor } from './editor-registry'
import { FormattingMenu } from './FormattingMenu'
import { SlashCommand } from './slash-command'
import { BlockDragHandle } from './drag-handle'
import { BlockSelection } from './block-selection'

interface EditorProps {
  /** Changes remount the editor with the new document. */
  pageId: string
  /** Serialized Tiptap JSON, or an empty string for a fresh page. */
  initialContent: string
  onChange(content: string, plainText: string): void
  /** Shift+Tab / Backspace at the very start moves focus back to the title. */
  onFocusTitle(): void
  /** When false, the document is shown but can't be edited (e.g. trashed pages). */
  editable?: boolean
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
  onFocusTitle,
  editable = true
}: EditorProps): React.JSX.Element {
  const editor = useEditor(
    {
      editable,
      extensions: [
        StarterKit.configure({
          // Replaced below with the syntax-highlighting version.
          codeBlock: false,
          // Replaced below with versions that wrap their output in a padded div.
          paragraph: false,
          heading: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          horizontalRule: false,
          // The line showing where a dragged block will land. Set explicitly
          // rather than left to the 1px `currentColor` default, which is
          // nearly invisible against body text.
          dropcursor: { color: '#2f6fa8', width: 4, class: 'graphite-dropcursor' }
        }),
        WrappedParagraph,
        WrappedHeading.configure({ levels: [1, 2, 3] }),
        WrappedBlockquote,
        WrappedBulletList,
        WrappedOrderedList,
        WrappedHorizontalRule,
        CodeBlock.configure({ lowlight }),
        MediaBlock,
        SubpageBlock,
        Underline,
        Highlight,
        WrappedTaskList,
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

  // The same page can flip between editable and not (trashing/restoring it)
  // without its id changing, so keep the live instance in sync rather than
  // relying on the remount above.
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  // Registered so tree mutations can reach this document while it's open —
  // see editor-registry.ts.
  useEffect(() => {
    if (!editor) return
    registerEditor(pageId, editor)
    return () => unregisterEditor(pageId, editor)
  }, [editor, pageId])

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
