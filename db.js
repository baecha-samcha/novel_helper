'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db = null;
let currentPath = null;

/* ------------------------------------------------------------------ */
/*  스키마 정의                                                        */
/* ------------------------------------------------------------------ */

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS characters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  age           TEXT,
  appearance    TEXT,
  personality   TEXT,
  affiliation   TEXT,
  secret        TEXT,
  image         TEXT,            -- data URL (base64)
  pos_x         REAL,            -- 관계도 노드 위치
  pos_y         REAL,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relationships (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  from_character_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  to_character_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  label               TEXT,
  directed            INTEGER NOT NULL DEFAULT 1,   -- 1: 방향성 있음, 0: 양방향
  created_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  category      TEXT,
  description   TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organizations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  category      TEXT,
  description   TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS glossary (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  term          TEXT NOT NULL,
  category      TEXT,
  definition    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  story_time    TEXT,            -- 작중 시간 (정렬용 문자열)
  sort_order    REAL,           -- 수동 정렬 순서
  description   TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_characters (
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, character_id)
);

-- 전체 텍스트 검색 인덱스 (trigram: 한글/CJK 부분 문자열 검색 지원)
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  entity_type UNINDEXED,
  entity_id   UNINDEXED,
  title,
  body,
  tokenize = 'trigram'
);
`;

/* ------------------------------------------------------------------ */
/*  초기화 / 연결                                                      */
/* ------------------------------------------------------------------ */

function open(dbPath) {
  if (db) {
    try { db.close(); } catch (_) { /* noop */ }
    db = null;
  }
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  currentPath = dbPath;
  return currentPath;
}

function requireDb() {
  if (!db) throw new Error('데이터베이스가 열려있지 않습니다.');
  return db;
}

function getPath() {
  return currentPath;
}

function close() {
  if (db) {
    try { db.close(); } catch (_) { /* noop */ }
    db = null;
    currentPath = null;
  }
}

/* ------------------------------------------------------------------ */
/*  FTS 인덱스 유지                                                    */
/* ------------------------------------------------------------------ */

function reindex(type, id, title, body) {
  const d = requireDb();
  d.prepare('DELETE FROM search_fts WHERE entity_type = ? AND entity_id = ?').run(type, id);
  d.prepare(
    'INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES (?, ?, ?, ?)'
  ).run(type, id, title || '', body || '');
}

function removeIndex(type, id) {
  requireDb().prepare(
    'DELETE FROM search_fts WHERE entity_type = ? AND entity_id = ?'
  ).run(type, id);
}

/* ------------------------------------------------------------------ */
/*  인물 (characters)                                                  */
/* ------------------------------------------------------------------ */

const characters = {
  list() {
    return requireDb().prepare('SELECT * FROM characters ORDER BY name COLLATE NOCASE').all();
  },
  get(id) {
    return requireDb().prepare('SELECT * FROM characters WHERE id = ?').get(id);
  },
  create(c) {
    const info = requireDb().prepare(`
      INSERT INTO characters (name, age, appearance, personality, affiliation, secret, image)
      VALUES (@name, @age, @appearance, @personality, @affiliation, @secret, @image)
    `).run(normalize(c, ['name', 'age', 'appearance', 'personality', 'affiliation', 'secret', 'image']));
    const id = info.lastInsertRowid;
    reindexCharacter(id);
    return this.get(id);
  },
  update(id, c) {
    requireDb().prepare(`
      UPDATE characters SET
        name=@name, age=@age, appearance=@appearance, personality=@personality,
        affiliation=@affiliation, secret=@secret, image=@image,
        updated_at=datetime('now')
      WHERE id=@id
    `).run({ id, ...normalize(c, ['name', 'age', 'appearance', 'personality', 'affiliation', 'secret', 'image']) });
    reindexCharacter(id);
    return this.get(id);
  },
  remove(id) {
    requireDb().prepare('DELETE FROM characters WHERE id = ?').run(id);
    removeIndex('character', id);
    return true;
  },
  setPosition(id, x, y) {
    requireDb().prepare('UPDATE characters SET pos_x=?, pos_y=? WHERE id=?').run(x, y, id);
    return true;
  }
};

function reindexCharacter(id) {
  const c = characters.get(id);
  if (!c) return;
  const body = [c.age, c.appearance, c.personality, c.affiliation, c.secret]
    .filter(Boolean).join(' ');
  reindex('character', id, c.name, body);
}

/* ------------------------------------------------------------------ */
/*  관계 (relationships)                                               */
/* ------------------------------------------------------------------ */

const relationships = {
  list() {
    return requireDb().prepare('SELECT * FROM relationships').all();
  },
  create(r) {
    const info = requireDb().prepare(`
      INSERT INTO relationships (from_character_id, to_character_id, label, directed)
      VALUES (@from_character_id, @to_character_id, @label, @directed)
    `).run({
      from_character_id: r.from_character_id,
      to_character_id: r.to_character_id,
      label: r.label || '',
      directed: r.directed ? 1 : 0
    });
    return requireDb().prepare('SELECT * FROM relationships WHERE id=?').get(info.lastInsertRowid);
  },
  update(id, r) {
    requireDb().prepare(`
      UPDATE relationships SET label=@label, directed=@directed WHERE id=@id
    `).run({ id, label: r.label || '', directed: r.directed ? 1 : 0 });
    return requireDb().prepare('SELECT * FROM relationships WHERE id=?').get(id);
  },
  remove(id) {
    requireDb().prepare('DELETE FROM relationships WHERE id=?').run(id);
    return true;
  }
};

/* ------------------------------------------------------------------ */
/*  장소 / 조직 / 용어  (동일 패턴)                                    */
/* ------------------------------------------------------------------ */

function makeCategoryEntity(table, type, fields, titleField, indexBody) {
  return {
    list() {
      return requireDb()
        .prepare(`SELECT * FROM ${table} ORDER BY category COLLATE NOCASE, ${titleField} COLLATE NOCASE`)
        .all();
    },
    get(id) {
      return requireDb().prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
    },
    create(row) {
      const cols = fields.join(', ');
      const params = fields.map(f => '@' + f).join(', ');
      const info = requireDb()
        .prepare(`INSERT INTO ${table} (${cols}) VALUES (${params})`)
        .run(normalize(row, fields));
      const id = info.lastInsertRowid;
      reindexRow(id);
      return this.get(id);
    },
    update(id, row) {
      const setClause = fields.map(f => `${f}=@${f}`).join(', ');
      requireDb()
        .prepare(`UPDATE ${table} SET ${setClause}, updated_at=datetime('now') WHERE id=@id`)
        .run({ id, ...normalize(row, fields) });
      reindexRow(id);
      return this.get(id);
    },
    remove(id) {
      requireDb().prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
      removeIndex(type, id);
      return true;
    }
  };

  function reindexRow(id) {
    const row = requireDb().prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
    if (!row) return;
    reindex(type, id, row[titleField], indexBody(row));
  }
}

const locations = makeCategoryEntity(
  'locations', 'location',
  ['name', 'category', 'description'],
  'name',
  (r) => [r.category, r.description].filter(Boolean).join(' ')
);

const organizations = makeCategoryEntity(
  'organizations', 'organization',
  ['name', 'category', 'description'],
  'name',
  (r) => [r.category, r.description].filter(Boolean).join(' ')
);

const glossary = makeCategoryEntity(
  'glossary', 'glossary',
  ['term', 'category', 'definition'],
  'term',
  (r) => [r.category, r.definition].filter(Boolean).join(' ')
);

/* ------------------------------------------------------------------ */
/*  사건 (events) + 관련 인물 태그                                     */
/* ------------------------------------------------------------------ */

const events = {
  list() {
    const d = requireDb();
    const rows = d.prepare(`
      SELECT * FROM events
      ORDER BY (sort_order IS NULL), sort_order, story_time COLLATE NOCASE, id
    `).all();
    const linkStmt = d.prepare(`
      SELECT c.id, c.name FROM event_characters ec
      JOIN characters c ON c.id = ec.character_id
      WHERE ec.event_id = ? ORDER BY c.name COLLATE NOCASE
    `);
    for (const e of rows) e.characters = linkStmt.all(e.id);
    return rows;
  },
  create(e) {
    const d = requireDb();
    const info = d.prepare(`
      INSERT INTO events (title, story_time, sort_order, description)
      VALUES (@title, @story_time, @sort_order, @description)
    `).run(normalize(e, ['title', 'story_time', 'sort_order', 'description']));
    const id = info.lastInsertRowid;
    setCharacters(id, e.character_ids || []);
    reindexEvent(id);
    return this.get(id);
  },
  update(id, e) {
    const d = requireDb();
    d.prepare(`
      UPDATE events SET title=@title, story_time=@story_time, sort_order=@sort_order,
        description=@description, updated_at=datetime('now')
      WHERE id=@id
    `).run({ id, ...normalize(e, ['title', 'story_time', 'sort_order', 'description']) });
    setCharacters(id, e.character_ids || []);
    reindexEvent(id);
    return this.get(id);
  },
  get(id) {
    const d = requireDb();
    const e = d.prepare('SELECT * FROM events WHERE id=?').get(id);
    if (!e) return null;
    e.characters = d.prepare(`
      SELECT c.id, c.name FROM event_characters ec
      JOIN characters c ON c.id = ec.character_id
      WHERE ec.event_id = ? ORDER BY c.name COLLATE NOCASE
    `).all(id);
    return e;
  },
  remove(id) {
    requireDb().prepare('DELETE FROM events WHERE id=?').run(id);
    removeIndex('event', id);
    return true;
  }
};

function setCharacters(eventId, ids) {
  const d = requireDb();
  d.prepare('DELETE FROM event_characters WHERE event_id=?').run(eventId);
  const ins = d.prepare('INSERT OR IGNORE INTO event_characters (event_id, character_id) VALUES (?, ?)');
  for (const cid of ids) ins.run(eventId, cid);
}

function reindexEvent(id) {
  const e = events.get(id);
  if (!e) return;
  const body = [e.story_time, e.description, ...(e.characters || []).map(c => c.name)]
    .filter(Boolean).join(' ');
  reindex('event', id, e.title, body);
}

/* ------------------------------------------------------------------ */
/*  전체 텍스트 검색                                                   */
/* ------------------------------------------------------------------ */

function search(query) {
  const d = requireDb();
  const q = (query || '').trim();
  if (!q) return [];

  let rows;
  if (q.length >= 3) {
    // trigram MATCH (3자 이상): 부분 문자열 검색
    const match = '"' + q.replace(/"/g, '""') + '"';
    rows = d.prepare(`
      SELECT entity_type, entity_id, title,
             snippet(search_fts, 3, '[', ']', '…', 12) AS snippet
      FROM search_fts
      WHERE search_fts MATCH ?
      ORDER BY rank
      LIMIT 200
    `).all(match);
  } else {
    // 짧은 질의 (1~2자): LIKE 폴백
    const like = '%' + q.replace(/[%_]/g, '\\$&') + '%';
    rows = d.prepare(`
      SELECT entity_type, entity_id, title,
             substr(body, 1, 80) AS snippet
      FROM search_fts
      WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\'
      LIMIT 200
    `).all(like, like);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  JSON 내보내기 / 가져오기                                           */
/* ------------------------------------------------------------------ */

function exportJSON() {
  const d = requireDb();
  return {
    meta: { app: 'novel-helper', version: 1, exported_at: new Date().toISOString() },
    characters: d.prepare('SELECT * FROM characters').all(),
    relationships: d.prepare('SELECT * FROM relationships').all(),
    locations: d.prepare('SELECT * FROM locations').all(),
    organizations: d.prepare('SELECT * FROM organizations').all(),
    glossary: d.prepare('SELECT * FROM glossary').all(),
    events: d.prepare('SELECT * FROM events').all(),
    event_characters: d.prepare('SELECT * FROM event_characters').all()
  };
}

/* ------------------------------------------------------------------ */
/*  유틸                                                               */
/* ------------------------------------------------------------------ */

function normalize(obj, fields) {
  const out = {};
  for (const f of fields) {
    let v = obj ? obj[f] : undefined;
    if (v === undefined) v = null;
    out[f] = v;
  }
  return out;
}

module.exports = {
  open, close, getPath, requireDb,
  characters, relationships, locations, organizations, glossary, events,
  search, exportJSON
};
