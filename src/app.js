import { toast, guard } from './ui.js';
import { renderCharacters } from './views/characters.js';
import { renderGraph } from './views/graph.js';
import { renderWorld } from './views/world.js';
import { renderTimeline } from './views/timeline.js';
import { renderSearch } from './views/search.js';

const VIEWS = {
  characters: { section: 'view-characters', render: renderCharacters },
  graph:      { section: 'view-graph',      render: renderGraph },
  world:      { section: 'view-world',      render: renderWorld },
  timeline:   { section: 'view-timeline',   render: renderTimeline },
  search:     { section: 'view-search',     render: renderSearch }
};

let current = null;

async function switchView(name) {
  if (!VIEWS[name]) return;
  current = name;

  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  const view = VIEWS[name];
  const section = document.getElementById(view.section);
  section.classList.add('active');
  try {
    await view.render(section);
  } catch (e) {
    console.error(e);
    section.innerHTML = `<div class="empty">화면을 불러오지 못했습니다: ${e.message}</div>`;
  }
}

// 네비게이션
document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => switchView(btn.dataset.view)));

// DB 경로 표시 갱신
async function refreshDbPath() {
  try {
    const p = await window.api.getDbPath();
    const el = document.getElementById('db-path');
    el.textContent = p || '(열린 DB 없음)';
    el.title = p || '';
  } catch (_) { /* noop */ }
}

// 현재 화면 새로고침 (DB 전환 후)
async function reloadAll() {
  await refreshDbPath();
  await switchView(current || 'characters');
}

// DB 파일 관리 버튼
document.getElementById('btn-open-db').addEventListener('click', async () => {
  const p = await guard(window.api.openDb());
  if (p) { toast('작품을 열었습니다.', 'ok'); await reloadAll(); }
});
document.getElementById('btn-new-db').addEventListener('click', async () => {
  const p = await guard(window.api.newDb());
  if (p) { toast('새 작품을 만들었습니다.', 'ok'); await reloadAll(); }
});
document.getElementById('btn-export-db').addEventListener('click', async () => {
  const p = await guard(window.api.exportDb());
  if (p) toast('DB를 내보냈습니다.', 'ok');
});
document.getElementById('btn-import-db').addEventListener('click', async () => {
  const p = await guard(window.api.importDb());
  if (p) { toast('DB를 가져왔습니다.', 'ok'); await reloadAll(); }
});
document.getElementById('btn-export-json').addEventListener('click', async () => {
  const p = await guard(window.api.exportJson());
  if (p) toast('JSON을 내보냈습니다.', 'ok');
});

// 시작
refreshDbPath();
switchView('characters');
