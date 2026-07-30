import { Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { FileText } from 'lucide-react'
import { SUBPAGE_NODE } from '@shared/subpage-block'
import { useWorkspace } from '@/lib/workspace'
import { displayTitle, findNode } from '@/lib/tree'
import { PageIcon } from '../PageIcon'

/**
 * A subpage embedded in its parent's body as a real block. The node stores
 * only the page id — icon and title are looked up from the workspace tree on
 * every render, so a rename or icon change shows up without touching the
 * document. Deleting the block removes just the link; the page itself stays
 * in the sidebar.
 */
function SubpageBlockView({ node }: NodeViewProps): React.JSX.Element {
  const { tree, openPage } = useWorkspace()
  const pageId = node.attrs.pageId as string
  const page = findNode(tree, pageId)

  return (
    <NodeViewWrapper>
      {page ? (
        <button
          type="button"
          contentEditable={false}
          onClick={() => openPage(pageId)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent"
        >
          <PageIcon icon={page.icon} className="flex-none" />
          <span className="truncate font-medium">{displayTitle(page.title)}</span>
        </button>
      ) : (
        // Trashed or permanently deleted — the tree no longer carries it.
        <div
          contentEditable={false}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-muted-foreground/60 select-none"
        >
          <FileText className="size-[1em] flex-none" />
          <span className="truncate font-medium">Deleted page</span>
        </div>
      )}
    </NodeViewWrapper>
  )
}

export const SubpageBlock = Node.create({
  name: SUBPAGE_NODE,

  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-subpage'),
        renderHTML: (attributes) => ({ 'data-subpage': attributes.pageId as string })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-subpage]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubpageBlockView)
  }
})
