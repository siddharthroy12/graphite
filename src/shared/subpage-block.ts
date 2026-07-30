/**
 * Helpers for the `subpage` block node, working on a page's serialized Tiptap
 * JSON. Shared between the renderer (workspace coupling for pages with no
 * live editor) and the main process (migration, duplicate) so both rewrite
 * documents the exact same way.
 *
 * Subpage nodes are always top-level blocks, so every function here only
 * touches `doc.content`.
 */

export const SUBPAGE_NODE = 'subpage'

interface JsonNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  [key: string]: unknown
}

function parseDoc(content: string): JsonNode {
  if (!content) return { type: 'doc', content: [] }
  try {
    const doc = JSON.parse(content) as JsonNode
    if (doc.type !== 'doc' || !Array.isArray(doc.content)) {
      return { type: 'doc', content: [] }
    }
    return doc
  } catch {
    // Plain-text bodies from older rows have no JSON to rewrite.
    return { type: 'doc', content: [] }
  }
}

const isSubpageFor = (node: JsonNode, pageId: string): boolean =>
  node.type === SUBPAGE_NODE && node.attrs?.pageId === pageId

/** Appends a subpage block at the end of the document. No-op if one exists. */
export function appendSubpageBlock(content: string, pageId: string): string {
  const doc = parseDoc(content)
  if (doc.content!.some((node) => isSubpageFor(node, pageId))) return content
  doc.content!.push({ type: SUBPAGE_NODE, attrs: { pageId } })
  return JSON.stringify(doc)
}

/** Removes every subpage block pointing at `pageId`. */
export function removeSubpageBlock(content: string, pageId: string): string {
  const doc = parseDoc(content)
  const next = doc.content!.filter((node) => !isSubpageFor(node, pageId))
  if (next.length === doc.content!.length) return content
  doc.content = next
  return JSON.stringify(doc)
}

/** Rewrites subpage block targets through an id map (page duplication). */
export function remapSubpageBlocks(
  content: string,
  idMap: ReadonlyMap<string, string>
): string {
  const doc = parseDoc(content)
  let changed = false
  for (const node of doc.content!) {
    if (node.type !== SUBPAGE_NODE) continue
    const target = node.attrs?.pageId
    const mapped = typeof target === 'string' ? idMap.get(target) : undefined
    if (mapped) {
      node.attrs = { ...node.attrs, pageId: mapped }
      changed = true
    }
  }
  return changed ? JSON.stringify(doc) : content
}
