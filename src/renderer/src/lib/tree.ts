import type { PageTreeNode } from '@shared/types'

/** Depth-first walk over the tree, parents before children. */
export function flattenTree(nodes: PageTreeNode[]): PageTreeNode[] {
  const out: PageTreeNode[] = []
  const visit = (list: PageTreeNode[]): void => {
    for (const node of list) {
      out.push(node)
      visit(node.children)
    }
  }
  visit(nodes)
  return out
}

export function findNode(nodes: PageTreeNode[], id: string): PageTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** Ids of every ancestor of `id`, so the sidebar can reveal a nested page. */
export function ancestorIds(nodes: PageTreeNode[], id: string): string[] {
  const path: string[] = []

  const visit = (list: PageTreeNode[], trail: string[]): boolean => {
    for (const node of list) {
      if (node.id === id) {
        path.push(...trail)
        return true
      }
      if (visit(node.children, [...trail, node.id])) return true
    }
    return false
  }

  visit(nodes, [])
  return path
}

/** True when `candidate` is `id` itself or sits beneath it. */
export function isWithinSubtree(
  nodes: PageTreeNode[],
  id: string,
  candidate: string
): boolean {
  const node = findNode(nodes, id)
  if (!node) return false
  if (id === candidate) return true
  return flattenTree(node.children).some((child) => child.id === candidate)
}

/**
 * Drag payload type for sidebar pages. Editor block drags don't carry it, which
 * is how the sidebar tells the two apart.
 */
export const PAGE_DRAG_TYPE = 'application/x-graphite-page'

export const UNTITLED = 'Untitled'

export function displayTitle(title: string): string {
  const trimmed = title.trim()
  return trimmed.length > 0 ? trimmed : UNTITLED
}
