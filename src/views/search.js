import { h, esc } from '../ui.js';

const TYPE_LABEL = {
  character: '인물',
  location: '장소',
  organization: '조직',
  glossary: '용어',
  event: '사건'
};

export function renderSearch(section) {
  section.innerHTML = '';

  const input = h('input', {
    class: 'search-inline', style: 'max-width:none;flex:1;',
    placeholder: '전체 설정에서 검색… (인물·장소·조직·용어·사건)'
  });
  const results = h('div');

  section.append(h('div', { class: 'view-header' }, [
    h('h2', { text: '검색' }),
    h('div', { class: 'tools', style: 'flex:1;' }, [input])
  ]));
  section.append(h('div', { class: 'graph-legend', style: 'margin-bottom:12px;',
    text: '3자 이상은 부분 일치(FTS5 trigram), 1~2자는 포함 검색으로 동작합니다.' }));
  section.append(results);

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 180);
  });
  input.focus();

  async function run() {
    const q = input.value.trim();
    results.innerHTML = '';
    if (!q) return;

    let rows;
    try {
      rows = await window.api.search(q);
    } catch (e) {
      results.append(h('div', { class: 'empty', text: '검색 오류: ' + e.message }));
      return;
    }
    if (!rows.length) {
      results.append(h('div', { class: 'empty', text: `"${q}" 결과가 없습니다.` }));
      return;
    }

    for (const r of rows) {
      const snippet = (r.snippet || '').replace(/\[([^\]]*)\]/g, '<span class="snippet-hit">$1</span>');
      results.append(h('div', { class: 'search-result' }, [
        h('div', { class: 'type', text: TYPE_LABEL[r.entity_type] || r.entity_type }),
        h('div', { class: 'title', text: r.title || '(제목 없음)' }),
        h('div', { class: 'snippet', html: snippet })
      ]));
    }
  }
}
