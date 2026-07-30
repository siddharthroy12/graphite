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
  /** Tiptap JSON document, serialized. Empty string means "never edited". */
  content: string
  /** Plain-text mirror of `content`, used for search. */
  plainText: string
  favorite: boolean
  /** Ordering among siblings. */
  position: number
  createdAt: number
  updatedAt: number
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

export interface CreatePageInput {
  parentId?: string | null
  title?: string
  icon?: string | null
  cover?: string | null
  coverPosition?: number
}

export interface UpdatePageInput {
  id: string
  title?: string
  icon?: string | null
  cover?: string | null
  coverPosition?: number
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
    /** Deletes the page and all of its descendants. Returns removed ids. */
    remove(id: string): Promise<string[]>
    duplicate(id: string): Promise<Page>
    move(input: MovePageInput): Promise<void>
    search(query: string): Promise<SearchResult[]>
    recent(limit?: number): Promise<PageSummary[]>
    breadcrumb(id: string): Promise<PageSummary[]>
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
