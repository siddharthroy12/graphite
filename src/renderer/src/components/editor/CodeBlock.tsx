import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps
} from '@tiptap/react'
import { createLowlight, common } from 'lowlight'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

/**
 * One shared lowlight registry for the whole editor: the extension highlights
 * against it and the node view lists its languages, so the two can never fall
 * out of sync.
 */
export const lowlight = createLowlight(common)

/** Display names for the lowlight ids that aren't already readable as-is. */
const LANGUAGE_LABELS: Record<string, string> = {
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  graphql: 'GraphQL',
  html: 'HTML',
  ini: 'INI',
  javascript: 'JavaScript',
  json: 'JSON',
  objectivec: 'Objective-C',
  php: 'PHP',
  'php-template': 'PHP Template',
  plaintext: 'Plain text',
  'python-repl': 'Python REPL',
  scss: 'SCSS',
  sql: 'SQL',
  typescript: 'TypeScript',
  vbnet: 'VB.NET',
  wasm: 'WebAssembly',
  xml: 'XML/HTML',
  yaml: 'YAML'
}

function labelFor(id: string): string {
  return LANGUAGE_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

/** Every registered language, sorted by display name for the dropdown. */
export const CODE_LANGUAGES = lowlight
  .listLanguages()
  .map((id) => ({ id, label: labelFor(id) }))
  .sort((a, b) => a.label.localeCompare(b.label))

/** The value a code block with no explicit language falls back to in the picker. */
const DEFAULT_LANGUAGE = 'plaintext'

function CodeBlockView({ node, updateAttributes }: NodeViewProps): React.JSX.Element {
  const language = (node.attrs.language as string | null) || DEFAULT_LANGUAGE

  return (
    <NodeViewWrapper as="pre" className="group/codeblock relative">
      {/* contentEditable=false keeps ProseMirror from treating the control as
          part of the code; the dropdown sits top-right, revealed on hover or
          while the block is focused. */}
      <div
        contentEditable={false}
        className="absolute top-2 right-2 opacity-0 transition-opacity group-focus-within/codeblock:opacity-100 group-hover/codeblock:opacity-100"
      >
        <Select value={language} onValueChange={(value) => updateAttributes({ language: value })}>
          <SelectTrigger
            size="sm"
            className="h-6 gap-1 border-border/60 bg-background/80 px-2 font-sans text-xs backdrop-blur"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {CODE_LANGUAGES.map((entry) => (
              <SelectItem key={entry.id} value={entry.id} className="text-xs">
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <NodeViewContent as="code" />
    </NodeViewWrapper>
  )
}

/**
 * The lowlight code block, plus a language picker rendered in its corner. All
 * of the highlighting behaviour comes from the base extension — this only
 * swaps in a React node view.
 */
export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    // `block-wrap` on the node view's outer element (the one the selection tint
    // and drag target land on) gives the code block the same 5px block padding
    // as every other block — see index.css.
    return ReactNodeViewRenderer(CodeBlockView, { className: 'block-wrap' })
  }
})
