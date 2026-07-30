import type { Editor } from '@tiptap/core'

/**
 * Live editor instances by page id, so tree mutations (create, trash,
 * restore, move) can update a page's subpage blocks in memory when the page
 * is open, instead of rewriting its stored content behind the editor's back.
 * A page can be open in more than one tab, hence a set per id.
 */
const editorsByPage = new Map<string, Set<Editor>>()
const pageByEditor = new WeakMap<Editor, string>()

export function registerEditor(pageId: string, editor: Editor): void {
  let set = editorsByPage.get(pageId)
  if (!set) {
    set = new Set()
    editorsByPage.set(pageId, set)
  }
  set.add(editor)
  pageByEditor.set(editor, pageId)
}

export function unregisterEditor(pageId: string, editor: Editor): void {
  const set = editorsByPage.get(pageId)
  if (!set) return
  set.delete(editor)
  if (set.size === 0) editorsByPage.delete(pageId)
}

export function editorsFor(pageId: string): Editor[] {
  return [...(editorsByPage.get(pageId) ?? [])]
}

export function pageIdFor(editor: Editor): string | null {
  return pageByEditor.get(editor) ?? null
}

/**
 * Set by the workspace provider so editor-side code (the slash menu) can
 * refresh the sidebar tree after creating a subpage, without importing the
 * workspace module (which would be a circular import).
 */
let treeRefresher: (() => void) | null = null

export function setTreeRefresher(refresh: (() => void) | null): void {
  treeRefresher = refresh
}

export function refreshTree(): void {
  treeRefresher?.()
}
