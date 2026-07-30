import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import type {
  CreatePageInput,
  MovePageInput,
  Page,
  PageSummary,
  PageTreeNode,
  Preferences,
  SearchResult,
  TrashedPage,
  UpdatePageInput
} from '../shared/types'

/** Shape of a row in the `pages` table. */
interface PageRow {
  id: string
  parent_id: string | null
  title: string
  icon: string | null
  cover: string | null
  cover_position: number
  content: string
  plain_text: string
  favorite: number
  position: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

type SummaryRow = Omit<PageRow, 'content' | 'plain_text'>

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  lastOpenPageId: null,
  sidebarWidth: 260,
  expandedIds: [],
  tabs: [],
  activeTabId: null,
  recentIcons: [],
  iconSkinTone: 0,
  iconColor: null
}

let db: Database.Database
let dbPath: string

function toPage(row: PageRow): Page {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    cover: row.cover,
    coverPosition: row.cover_position,
    content: row.content,
    plainText: row.plain_text,
    favorite: row.favorite === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  }
}

function toSummary(row: SummaryRow): PageSummary {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    cover: row.cover,
    coverPosition: row.cover_position,
    favorite: row.favorite === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  }
}

const SUMMARY_COLUMNS =
  'id, parent_id, title, icon, cover, cover_position, favorite, position, created_at, updated_at, deleted_at'

export function initDatabase(): void {
  dbPath = join(app.getPath('userData'), 'graphite.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id          TEXT PRIMARY KEY,
      parent_id   TEXT REFERENCES pages(id) ON DELETE CASCADE,
      title       TEXT NOT NULL DEFAULT '',
      icon        TEXT,
      cover       TEXT,
      cover_position REAL NOT NULL DEFAULT 0.5,
      content     TEXT NOT NULL DEFAULT '',
      plain_text  TEXT NOT NULL DEFAULT '',
      favorite    INTEGER NOT NULL DEFAULT 0,
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      deleted_at  INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id, position);
    CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at DESC);
    -- idx_pages_deleted is created in migrate(): on an existing database this
    -- block is a no-op (the table already exists), so an index on a column
    -- that hasn't been added yet would fail here.

    CREATE TABLE IF NOT EXISTS preferences (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      title,
      plain_text,
      content='pages',
      content_rowid='rowid',
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, title, plain_text)
      VALUES (new.rowid, new.title, new.plain_text);
    END;

    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, plain_text)
      VALUES ('delete', old.rowid, old.title, old.plain_text);
    END;

    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, plain_text)
      VALUES ('delete', old.rowid, old.title, old.plain_text);
      INSERT INTO pages_fts(rowid, title, plain_text)
      VALUES (new.rowid, new.title, new.plain_text);
    END;
  `)

  migrate()
  seedIfEmpty()
}

/**
 * Brings a database created by an older build up to the current schema.
 * `CREATE TABLE IF NOT EXISTS` above only covers fresh installs, so every
 * column added after the first release needs an entry here.
 */
function migrate(): void {
  const columns = new Set(
    db.prepare<[], { name: string }>('PRAGMA table_info(pages)').all().map((row) => row.name)
  )

  if (!columns.has('cover')) {
    db.exec('ALTER TABLE pages ADD COLUMN cover TEXT')
  }
  if (!columns.has('cover_position')) {
    db.exec('ALTER TABLE pages ADD COLUMN cover_position REAL NOT NULL DEFAULT 0.5')
  }
  if (!columns.has('deleted_at')) {
    db.exec('ALTER TABLE pages ADD COLUMN deleted_at INTEGER')
    db.exec('CREATE INDEX IF NOT EXISTS idx_pages_deleted ON pages(deleted_at)')
  }
}

export function getDatabasePath(): string {
  return dbPath
}

export function closeDatabase(): void {
  db?.close()
}

/** Every icon and cover value in use — how uploaded image files are garbage-collected. */
export function getUsedImages(): string[] {
  return db
    .prepare<[], { value: string }>(
      `SELECT DISTINCT icon AS value FROM pages WHERE icon IS NOT NULL
       UNION
       SELECT DISTINCT cover AS value FROM pages WHERE cover IS NOT NULL`
    )
    .all()
    .map((row) => row.value)
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

function nextPosition(parentId: string | null): number {
  const row = db
    .prepare<[string | null], { next: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM pages
       WHERE parent_id IS ? AND deleted_at IS NULL`
    )
    .get(parentId)
  return row?.next ?? 0
}

export function createPage(input: CreatePageInput): Page {
  const now = Date.now()
  const parentId = input.parentId ?? null

  if (parentId !== null && !pageExists(parentId)) {
    throw new Error(`Cannot create page: parent ${parentId} does not exist`)
  }

  const row: PageRow = {
    id: randomUUID(),
    parent_id: parentId,
    title: input.title ?? '',
    icon: input.icon ?? null,
    cover: input.cover ?? null,
    cover_position: input.coverPosition ?? 0.5,
    content: '',
    plain_text: '',
    favorite: 0,
    position: nextPosition(parentId),
    created_at: now,
    updated_at: now,
    deleted_at: null
  }

  db.prepare(
    `INSERT INTO pages (id, parent_id, title, icon, cover, cover_position, content, plain_text, favorite, position, created_at, updated_at, deleted_at)
     VALUES (@id, @parent_id, @title, @icon, @cover, @cover_position, @content, @plain_text, @favorite, @position, @created_at, @updated_at, @deleted_at)`
  ).run(row)

  return toPage(row)
}

function pageExists(id: string): boolean {
  return (
    db.prepare('SELECT 1 FROM pages WHERE id = ? AND deleted_at IS NULL').get(id) !== undefined
  )
}

export function getPage(id: string): Page | null {
  const row = db.prepare<[string], PageRow>('SELECT * FROM pages WHERE id = ?').get(id)
  return row ? toPage(row) : null
}

export function updatePage(input: UpdatePageInput): Page | null {
  const existing = getPage(input.id)
  if (!existing) return null

  // Re-parenting through `update` would let a page become its own ancestor;
  // `movePage` is the guarded path for that.
  if (input.parentId !== undefined && input.parentId !== existing.parentId) {
    movePage({
      id: input.id,
      parentId: input.parentId,
      index: Number.MAX_SAFE_INTEGER
    })
  }

  const fields: string[] = []
  const values: unknown[] = []

  const assign = (column: string, value: unknown): void => {
    fields.push(`${column} = ?`)
    values.push(value)
  }

  if (input.title !== undefined) assign('title', input.title)
  if (input.icon !== undefined) assign('icon', input.icon)
  if (input.cover !== undefined) assign('cover', input.cover)
  if (input.coverPosition !== undefined) assign('cover_position', input.coverPosition)
  if (input.content !== undefined) assign('content', input.content)
  if (input.plainText !== undefined) assign('plain_text', input.plainText)
  if (input.favorite !== undefined) assign('favorite', input.favorite ? 1 : 0)

  if (fields.length > 0) {
    assign('updated_at', Date.now())
    values.push(input.id)
    db.prepare(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  return getPage(input.id)
}

/** Ids of `id` and every page beneath it, parents before children. */
function descendantIds(id: string): string[] {
  return db
    .prepare<[string], { id: string }>(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM pages WHERE id = ?
         UNION ALL
         SELECT p.id FROM pages p JOIN subtree s ON p.parent_id = s.id
       )
       SELECT id FROM subtree`
    )
    .all(id)
    .map((r) => r.id)
}

/** Moves a page and its subtree to trash by stamping `deleted_at`, leaving the rows in place. */
export function trashPage(id: string): string[] {
  const ids = descendantIds(id)
  if (ids.length === 0) return []

  const now = Date.now()
  db.transaction(() => {
    const stamp = db.prepare('UPDATE pages SET deleted_at = ? WHERE id = ?')
    for (const pageId of ids) stamp.run(now, pageId)
  })()

  return ids
}

/**
 * Restores a single trashed page — not its descendants, which stay trashed
 * until restored themselves. If its original parent is gone or still
 * trashed, it's reparented to the top level rather than left pointing at a
 * parent an active page is never allowed to have.
 */
export function restorePage(id: string): Page | null {
  const row = db.prepare<[string], PageRow>('SELECT * FROM pages WHERE id = ?').get(id)
  if (!row || row.deleted_at === null) return row ? toPage(row) : null

  let parentId = row.parent_id
  if (parentId !== null) {
    const parent = db
      .prepare<[string], { deleted_at: number | null }>('SELECT deleted_at FROM pages WHERE id = ?')
      .get(parentId)
    if (!parent || parent.deleted_at !== null) parentId = null
  }

  db.transaction(() => {
    db.prepare(
      'UPDATE pages SET deleted_at = NULL, parent_id = ?, position = ?, updated_at = ? WHERE id = ?'
    ).run(parentId, nextPosition(parentId), Date.now(), id)
  })()

  return getPage(id)
}

/** Deletes one trashed page and its (also trashed) subtree for good. */
export function permanentlyDeletePage(id: string): string[] {
  const ids = descendantIds(id)
  if (ids.length === 0) return []

  // ON DELETE CASCADE removes the descendants; the FTS triggers follow.
  db.transaction(() => {
    db.prepare('DELETE FROM pages WHERE id = ?').run(id)
  })()

  return ids
}

export function getTrash(): TrashedPage[] {
  return db
    .prepare<
      [],
      {
        id: string
        title: string
        icon: string | null
        deleted_at: number
        parent_title: string | null
      }
    >(
      `SELECT p.id AS id,
              p.title AS title,
              p.icon AS icon,
              p.deleted_at AS deleted_at,
              parent.title AS parent_title
       FROM pages p
       LEFT JOIN pages parent ON parent.id = p.parent_id
       WHERE p.deleted_at IS NOT NULL
       ORDER BY p.deleted_at DESC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      title: row.title,
      icon: row.icon,
      deletedAt: row.deleted_at,
      parentTitle: row.parent_title
    }))
}

export function emptyTrash(): string[] {
  const ids = db
    .prepare<[], { id: string }>('SELECT id FROM pages WHERE deleted_at IS NOT NULL')
    .all()
    .map((row) => row.id)
  if (ids.length === 0) return []

  db.prepare('DELETE FROM pages WHERE deleted_at IS NOT NULL').run()
  return ids
}

/** Purges anything trashed longer than `maxAgeMs`. Cascade takes any descendants with it. */
export function purgeExpiredTrash(maxAgeMs: number): number {
  const cutoff = Date.now() - maxAgeMs
  return db.prepare('DELETE FROM pages WHERE deleted_at IS NOT NULL AND deleted_at <= ?').run(cutoff)
    .changes
}

export function duplicatePage(id: string): Page {
  const source = getPage(id)
  if (!source) throw new Error(`Cannot duplicate: page ${id} does not exist`)

  const copyId = db.transaction((): string => {
    const rootCopy = createPage({
      parentId: source.parentId,
      title: source.title ? `${source.title} (copy)` : '',
      icon: source.icon,
      cover: source.cover,
      coverPosition: source.coverPosition
    })
    updatePage({
      id: rootCopy.id,
      content: source.content,
      plainText: source.plainText
    })

    // Breadth-first copy so a parent's new id always exists before its children.
    const queue: Array<{ sourceId: string; copyId: string }> = [
      { sourceId: source.id, copyId: rootCopy.id }
    ]

    while (queue.length > 0) {
      const { sourceId, copyId: newParentId } = queue.shift()!
      const children = db
        .prepare<[string], PageRow>(
          'SELECT * FROM pages WHERE parent_id IS ? AND deleted_at IS NULL ORDER BY position'
        )
        .all(sourceId)

      for (const child of children) {
        const childCopy = createPage({
          parentId: newParentId,
          title: child.title,
          icon: child.icon,
          cover: child.cover,
          coverPosition: child.cover_position
        })
        updatePage({
          id: childCopy.id,
          content: child.content,
          plainText: child.plain_text
        })
        queue.push({ sourceId: child.id, copyId: childCopy.id })
      }
    }

    return rootCopy.id
  })()

  return getPage(copyId)!
}

export function movePage({ id, parentId, index }: MovePageInput): void {
  const page = getPage(id)
  if (!page) throw new Error(`Cannot move: page ${id} does not exist`)

  // Dropping a page into its own subtree would detach that subtree from the root.
  if (parentId !== null) {
    if (parentId === id || descendantIds(id).includes(parentId)) {
      throw new Error('Cannot move a page inside itself')
    }
    if (!pageExists(parentId)) {
      throw new Error(`Cannot move: parent ${parentId} does not exist`)
    }
  }

  db.transaction(() => {
    const siblings = db
      .prepare<[string | null], { id: string }>(
        'SELECT id FROM pages WHERE parent_id IS ? AND deleted_at IS NULL ORDER BY position'
      )
      .all(parentId)
      .map((r) => r.id)
      .filter((siblingId) => siblingId !== id)

    const clamped = Math.max(0, Math.min(index, siblings.length))
    siblings.splice(clamped, 0, id)

    const reposition = db.prepare(
      'UPDATE pages SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?'
    )
    const now = Date.now()
    siblings.forEach((siblingId, position) => {
      reposition.run(parentId, position, now, siblingId)
    })
  })()
}

export function getPageTree(): PageTreeNode[] {
  const rows = db
    .prepare<[], SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM pages WHERE deleted_at IS NULL ORDER BY position, created_at`
    )
    .all()

  const nodes = new Map<string, PageTreeNode>()
  for (const row of rows) {
    nodes.set(row.id, { ...toSummary(row), children: [] })
  }

  const roots: PageTreeNode[] = []
  for (const row of rows) {
    const node = nodes.get(row.id)!
    const parent = row.parent_id ? nodes.get(row.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

export function getBreadcrumb(id: string): PageSummary[] {
  // Every column is qualified: the CTE also carries `id`/`parent_id`.
  const rows = db
    .prepare<[string], SummaryRow>(
      `WITH RECURSIVE ancestry(node_id, next_id, depth) AS (
         SELECT id, parent_id, 0 FROM pages WHERE id = ?
         UNION ALL
         SELECT p.id, p.parent_id, a.depth + 1
         FROM pages p JOIN ancestry a ON p.id = a.next_id
       )
       SELECT p.id AS id,
              p.parent_id AS parent_id,
              p.title AS title,
              p.icon AS icon,
              p.cover AS cover,
              p.cover_position AS cover_position,
              p.favorite AS favorite,
              p.position AS position,
              p.created_at AS created_at,
              p.updated_at AS updated_at,
              p.deleted_at AS deleted_at
       FROM ancestry a JOIN pages p ON p.id = a.node_id
       ORDER BY a.depth DESC`
    )
    .all(id)

  return rows.map(toSummary)
}

export function getRecentPages(limit = 12): PageSummary[] {
  return db
    .prepare<[number], SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM pages WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`
    )
    .all(limit)
    .map(toSummary)
}

/**
 * Turns user input into an FTS5 prefix query. Every character with meaning in
 * the FTS grammar is dropped, then each surviving token is quoted, so text like
 * `NEAR("a b")` or `foo-bar` is searched literally instead of parsed.
 */
function toMatchQuery(query: string): string | null {
  const tokens = query
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (tokens.length === 0) return null
  return tokens.map((token) => `"${token}"*`).join(' ')
}

export function searchPages(query: string): SearchResult[] {
  const match = toMatchQuery(query)
  if (!match) return []

  return db
    .prepare<[string], { id: string; title: string; icon: string | null; snippet: string }>(
      `SELECT p.id AS id,
              p.title AS title,
              p.icon AS icon,
              snippet(pages_fts, 1, '', '', '…', 12) AS snippet
       FROM pages_fts
       JOIN pages p ON p.rowid = pages_fts.rowid
       WHERE pages_fts MATCH ? AND p.deleted_at IS NULL
       ORDER BY rank
       LIMIT 30`
    )
    .all(match)
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

export function getPreferences(): Preferences {
  const rows = db.prepare<[], { key: string; value: string }>('SELECT * FROM preferences').all()
  const prefs: Preferences = { ...DEFAULT_PREFERENCES }

  for (const { key, value } of rows) {
    if (!(key in DEFAULT_PREFERENCES)) continue
    try {
      // A hand-edited or partially written row must not take the app down.
      ;(prefs as unknown as Record<string, unknown>)[key] = JSON.parse(value)
    } catch {
      // Keep the default for this key.
    }
  }

  return prefs
}

export function setPreferences(patch: Partial<Preferences>): Preferences {
  const upsert = db.prepare(
    `INSERT INTO preferences (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )

  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_PREFERENCES)) continue
      upsert.run(key, JSON.stringify(value))
    }
  })()

  return getPreferences()
}

/* -------------------------------------------------------------------------- */
/* First run                                                                  */
/* -------------------------------------------------------------------------- */

function seedIfEmpty(): void {
  const { count } = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM pages').get()!
  if (count > 0) return

  const welcome = createPage({ title: 'Welcome to Graphite', icon: '👋' })
  updatePage({
    id: welcome.id,
    content: JSON.stringify(WELCOME_DOC),
    plainText: WELCOME_PLAIN_TEXT
  })

  createPage({ parentId: welcome.id, title: 'Quick notes', icon: '📝' })
  createPage({ title: 'Tasks', icon: '✅' })
}

const WELCOME_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Everything you write here stays on this machine — no account, no sync, no network.'
        }
      ]
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Getting started' }] },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', marks: [{ type: 'code' }], text: '/' },
                { type: 'text', text: ' on an empty line opens the block menu' }
              ]
            }
          ]
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', marks: [{ type: 'code' }], text: 'Cmd/Ctrl + K' },
                { type: 'text', text: ' searches every page' }
              ]
            }
          ]
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Select text to bring up the formatting bar' }]
            }
          ]
        }
      ]
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Try it out' }] },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open Graphite' }] }]
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Create a page in the sidebar' }] }
          ]
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Nest a page inside another' }] }
          ]
        }
      ]
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Pages save automatically a moment after you stop typing.' }
          ]
        }
      ]
    }
  ]
}

const WELCOME_PLAIN_TEXT = [
  'Everything you write here stays on this machine — no account, no sync, no network.',
  'Getting started',
  '/ on an empty line opens the block menu',
  'Cmd/Ctrl + K searches every page',
  'Select text to bring up the formatting bar',
  'Try it out',
  'Open Graphite',
  'Create a page in the sidebar',
  'Nest a page inside another',
  'Pages save automatically a moment after you stop typing.'
].join('\n')
