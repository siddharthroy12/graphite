import { useState } from 'react'
import { BubbleMenu, type Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline as UnderlineIcon,
  Unlink
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface FormattingMenuProps {
  editor: Editor
}

/** Appears over a text selection, like Notion's inline toolbar. */
export function FormattingMenu({ editor }: FormattingMenuProps): React.JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')

  const openLinkEditor = (): void => {
    setLinkValue(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
  }

  const applyLink = (): void => {
    const href = linkValue.trim()
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      // A bare `example.com` should still become a working link.
      const normalized = /^https?:\/\//i.test(href) ? href : `https://${href}`
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
    }
    setLinkOpen(false)
    setLinkValue('')
  }

  const marks = [
    { name: 'bold', icon: Bold, label: 'Bold', run: () => editor.chain().focus().toggleBold().run() },
    {
      name: 'italic',
      icon: Italic,
      label: 'Italic',
      run: () => editor.chain().focus().toggleItalic().run()
    },
    {
      name: 'underline',
      icon: UnderlineIcon,
      label: 'Underline',
      run: () => editor.chain().focus().toggleUnderline().run()
    },
    {
      name: 'strike',
      icon: Strikethrough,
      label: 'Strikethrough',
      run: () => editor.chain().focus().toggleStrike().run()
    },
    {
      name: 'code',
      icon: Code,
      label: 'Inline code',
      run: () => editor.chain().focus().toggleCode().run()
    },
    {
      name: 'highlight',
      icon: Highlighter,
      label: 'Highlight',
      run: () => editor.chain().focus().toggleHighlight().run()
    }
  ]

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, placement: 'top', maxWidth: 'none' }}
      shouldShow={({ editor: instance, state, from, to }) => {
        // Hide inside code blocks, where inline marks don't apply.
        if (instance.isActive('codeBlock')) return false
        // Selecting a whole block via its drag handle is a NodeSelection, not
        // a text range — an inline formatting bar has nothing to act on there.
        if (state.selection instanceof NodeSelection) return false
        return from !== to
      }}
      className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
    >
      {linkOpen ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={linkValue}
            placeholder="Paste or type a link"
            className="h-8 w-64 text-sm"
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                applyLink()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setLinkOpen(false)
              }
            }}
          />
          <Button size="sm" className="h-8" onClick={applyLink}>
            Apply
          </Button>
        </div>
      ) : (
        <>
          {marks.map(({ name, icon: Icon, label, run }) => (
            <Button
              key={name}
              type="button"
              variant="ghost"
              size="icon"
              title={label}
              aria-label={label}
              className={cn('size-8', editor.isActive(name) && 'bg-accent text-accent-foreground')}
              onClick={run}
            >
              <Icon className="size-4" />
            </Button>
          ))}

          <Separator orientation="vertical" className="mx-0.5 h-5" />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Add link"
            aria-label="Add link"
            className={cn('size-8', editor.isActive('link') && 'bg-accent text-accent-foreground')}
            onClick={openLinkEditor}
          >
            <LinkIcon className="size-4" />
          </Button>

          {editor.isActive('link') && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Remove link"
              aria-label="Remove link"
              className="size-8"
              onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
            >
              <Unlink className="size-4" />
            </Button>
          )}
        </>
      )}
    </BubbleMenu>
  )
}
