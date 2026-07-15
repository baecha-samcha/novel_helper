'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');

let mainWindow = null;

/* ------------------------------------------------------------------ */
/*  설정 (마지막으로 연 DB 경로 저장)                                  */
/* ------------------------------------------------------------------ */

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
  } catch (_) {
    return {};
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('설정 저장 실패:', e);
  }
}

function defaultDbPath() {
  return path.join(app.getPath('documents'), 'NovelHelper', 'novel.db');
}

/* ------------------------------------------------------------------ */
/*  DB 열기                                                            */
/* ------------------------------------------------------------------ */

function openDatabase(dbPath) {
  const opened = db.open(dbPath);
  const cfg = loadConfig();
  cfg.lastDbPath = opened;
  saveConfig(cfg);
  if (mainWindow) mainWindow.setTitle(`NovelHelper — ${path.basename(opened)}`);
  return opened;
}

/* ------------------------------------------------------------------ */
/*  윈도우                                                             */
/* ------------------------------------------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  // 마지막 DB 자동 열기 (없으면 기본 경로 생성)
  const cfg = loadConfig();
  const target = cfg.lastDbPath && fs.existsSync(path.dirname(cfg.lastDbPath))
    ? cfg.lastDbPath
    : defaultDbPath();
  try {
    openDatabase(target);
  } catch (e) {
    console.error('초기 DB 열기 실패:', e);
  }

  createWindow();
  if (mainWindow && db.getPath()) {
    mainWindow.setTitle(`NovelHelper — ${path.basename(db.getPath())}`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  db.close();
  if (process.platform !== 'darwin') app.quit();
});

/* ------------------------------------------------------------------ */
/*  IPC — 안전 래퍼                                                    */
/* ------------------------------------------------------------------ */

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      console.error(`[${channel}]`, e);
      return { ok: false, error: e.message || String(e) };
    }
  });
}

/* ---- DB 파일 관리 -------------------------------------------------- */

handle('db:getPath', () => db.getPath());

handle('db:new', async () => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '새 작품 데이터베이스 만들기',
    defaultPath: defaultDbPath(),
    filters: [{ name: 'Novel DB', extensions: ['db'] }]
  });
  if (res.canceled || !res.filePath) return null;
  return openDatabase(res.filePath);
});

handle('db:open', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '작품 데이터베이스 열기',
    properties: ['openFile'],
    filters: [{ name: 'Novel DB', extensions: ['db'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  return openDatabase(res.filePaths[0]);
});

/* ---- 백업 --------------------------------------------------------- */

handle('backup:exportDb', async () => {
  const src = db.getPath();
  if (!src) throw new Error('열려있는 데이터베이스가 없습니다.');
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'DB 파일 내보내기',
    defaultPath: `novel-backup-${stamp()}.db`,
    filters: [{ name: 'Novel DB', extensions: ['db'] }]
  });
  if (res.canceled || !res.filePath) return null;
  // WAL 내용을 파일에 반영 후 복사
  db.requireDb().pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(src, res.filePath);
  return res.filePath;
});

handle('backup:importDb', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'DB 파일 가져오기 (현재 작품으로 전환)',
    properties: ['openFile'],
    filters: [{ name: 'Novel DB', extensions: ['db'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  return openDatabase(res.filePaths[0]);
});

handle('backup:exportJson', async () => {
  const data = db.exportJSON();
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'JSON 내보내기',
    defaultPath: `novel-export-${stamp()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), 'utf-8');
  return res.filePath;
});

/* ---- 이미지 선택 -------------------------------------------------- */

handle('image:pick', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '이미지 선택',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const file = res.filePaths[0];
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  const buf = fs.readFileSync(file);
  return `data:image/${mime};base64,${buf.toString('base64')}`;
});

/* ---- 인물 --------------------------------------------------------- */

handle('char:list', () => db.characters.list());
handle('char:create', (c) => db.characters.create(c));
handle('char:update', (id, c) => db.characters.update(id, c));
handle('char:remove', (id) => db.characters.remove(id));
handle('char:setPosition', (id, x, y) => db.characters.setPosition(id, x, y));

/* ---- 관계 --------------------------------------------------------- */

handle('rel:list', () => db.relationships.list());
handle('rel:create', (r) => db.relationships.create(r));
handle('rel:update', (id, r) => db.relationships.update(id, r));
handle('rel:remove', (id) => db.relationships.remove(id));

/* ---- 장소 / 조직 / 용어 ------------------------------------------- */

for (const [ns, ent] of [['loc', 'locations'], ['org', 'organizations'], ['glo', 'glossary']]) {
  handle(`${ns}:list`, () => db[ent].list());
  handle(`${ns}:create`, (row) => db[ent].create(row));
  handle(`${ns}:update`, (id, row) => db[ent].update(id, row));
  handle(`${ns}:remove`, (id) => db[ent].remove(id));
}

/* ---- 사건 --------------------------------------------------------- */

handle('evt:list', () => db.events.list());
handle('evt:create', (e) => db.events.create(e));
handle('evt:update', (id, e) => db.events.update(id, e));
handle('evt:remove', (id) => db.events.remove(id));

/* ---- 검색 --------------------------------------------------------- */

handle('search:query', (q) => db.search(q));

/* ------------------------------------------------------------------ */

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
