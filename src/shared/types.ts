/**
 * Types shared between the main process, the preload bridge and the renderer.
 * Keep this file dependency-free so every layer can import it.
 */

export interface Page {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  /** Banner image above the title: a `gradient:` preset or an uploaded `file:`. */
  cover: string | null
  /** Which slice of a tall cover is shown, 0 (top) to 1 (bottom). */
  coverPosition: number
  /** Body font: `default` (sans), `serif`, or `mono`. */
  font: string
  /** Tiptap JSON document, serialized. Empty string means "never edited". */
  content: string
  /** Plain-text mirror of `content`, used for search. */
  plainText: string
  favorite: boolean
  /** Ordering among siblings. */
  position: number
  createdAt: number
  updatedAt: number
  /** When the page was moved to trash; `null` if it's active. */
  deletedAt: number | null
}

/** A page without its (potentially large) body — what the sidebar tree needs. */
export type PageSummary = Omit<Page, 'content' | 'plainText'>

export interface PageTreeNode extends PageSummary {
  children: PageTreeNode[]
}

export interface SearchResult {
  id: string
  title: string
  icon: string | null
  /** Text surrounding the match, for the result list. */
  snippet: string
}

/** A row in the trash view — just enough to list and restore it. */
export interface TrashedPage {
  id: string
  title: string
  icon: string | null
  deletedAt: number
  /** Title of the page it lived under, or `null` if it was a top-level page. */
  parentTitle: string | null
}

export interface CreatePageInput {
  parentId?: string | null
  title?: string
  icon?: string | null
  cover?: string | null
  coverPosition?: number
  font?: string
}

export interface UpdatePageInput {
  id: string
  title?: string
  icon?: string | null
  cover?: string | null
  coverPosition?: number
  font?: string
  content?: string
  plainText?: string
  favorite?: boolean
  parentId?: string | null
  position?: number
}

export interface MovePageInput {
  id: string
  parentId: string | null
  /** Index among the new siblings. */
  index: number
}

export type ThemePreference = 'light' | 'dark' | 'system'

/** A tab as stored on disk. Navigation history is intentionally not persisted. */
export interface PersistedTab {
  id: string
  /** `null` is an empty tab showing the "no page open" state. */
  pageId: string | null
}

export interface Preferences {
  theme: ThemePreference
  lastOpenPageId: string | null
  sidebarWidth: number
  expandedIds: string[]
  tabs: PersistedTab[]
  activeTabId: string | null
  /** Most recently picked page icons, newest first. */
  recentIcons: string[]
  /** Emoji skin tone, 0 (default yellow) through 5. */
  iconSkinTone: number
  /** Last colour picked for a lucide icon; `null` means the inherited default. */
  iconColor: string | null
}

/** The surface exposed on `window.api` by the preload script. */
export interface GraphiteApi {
  pages: {
    tree(): Promise<PageTreeNode[]>
    get(id: string): Promise<Page | null>
    create(input: CreatePageInput): Promise<Page>
    update(input: UpdatePageInput): Promise<Page | null>
    /** Moves the page and its descendants to trash. Returns the affected ids. */
    trash(id: string): Promise<string[]>
    duplicate(id: string): Promise<Page>
    move(input: MovePageInput): Promise<void>
    search(query: string): Promise<SearchResult[]>
    recent(limit?: number): Promise<PageSummary[]>
    breadcrumb(id: string): Promise<PageSummary[]>
    trashList(): Promise<TrashedPage[]>
    /** Brings a page back; reparents it to the top level if its parent is gone or also trashed. */
    restore(id: string): Promise<Page | null>
    /** Deletes a single trashed page and its descendants for good. Returns the affected ids. */
    permanentlyDelete(id: string): Promise<string[]>
    /** Empties the trash entirely. Returns the affected ids. */
    emptyTrash(): Promise<string[]>
  }
  images: {
    /** Stores an uploaded image; resolves to the `file:` value naming it. */
    upload(data: Uint8Array, type: string, purpose: 'icon' | 'cover'): Promise<string>
  }
  prefs: {
    get(): Promise<Preferences>
    set(patch: Partial<Preferences>): Promise<Preferences>
  }
  system: {
    /** Absolute path of the on-disk database, shown in settings. */
    dataPath(): Promise<string>
    revealData(): Promise<void>
    openExternal(url: string): Promise<void>
    platform: NodeJS.Platform
  }
}
