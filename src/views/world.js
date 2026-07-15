import { h, guard, formModal, confirmDialog, toast } from '../ui.js';

const TABS = [
  {
    key: 'locs', label: '장소', api: () => window.api.locs,
    titleField: 'name', titleLabel: '이름',
    descField: 'description', descLabel: '설명'
  },
  {
    key: 'orgs', label: '조직', api: () => window.api.orgs,
    titleField: 'name', titleLabel: '이름',
    descField: 'description', descLabel: '설명'
  },
  {
    key: 'glos', label: '용어사전', api: () => window.api.glos,
    titleField: 'term', titleLabel: '용어',
    descField: 'definition', descLabel: '정의'
  }
];

let activeTab = 'locs';

export async function renderWorld(section) {
  section.innerHTML = '';
  const tab = TABS.find(t => t.key === activeTab);

  const subtabs = h('div', { class: 'subtabs' },
    TABS.map(t => h('button', {
      class: 'subtab' + (t.key === activeTab ? ' active' : ''),
      text: t.label,
      onClick: () => { activeTab = t.key; renderWorld(section); }
    }))
  );

  section.append(h('div', { class: 'view-header' }, [
    h('h2', { text: '배경 / 세계관' }),
    h('div', { class: 'tools' }, [
      h('button', { class: 'primary', text: `+ ${tab.label} 추가`, onClick: () => edit(null) })
    ])
  ]));
  section.append(subtabs);

  const rows = await tab.api().list();

  if (!rows.length) {
    section.append(h('div', { class: 'empty', text: `등록된 ${tab.label} 항목이 없습니다.` }));
    return;
  }

  // 카테고리별 그룹핑
  const groups = new Map();
  for (const r of rows) {
    const cat = r.category || '(분류 없음)';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(r);
  }

  for (const [cat, items] of groups) {
    section.append(h('h3', { text: cat, style: 'margin:18px 0 10px;color:var(--text-dim);font-size:14px;' }));
    const grid = h('div', { class: 'grid' });
    for (const r of items) grid.append(card(r));
    section.append(grid);
  }

  function card(r) {
    return h('div', { class: 'card' }, [
      h('h3', { text: r[tab.titleField] }),
      r.category && h('span', { class: 'chip', text: r.category }),
      r[tab.descField] && h('div', { class: 'row', style: 'white-space:pre-wrap;', text: r[tab.descField] }),
      h('div', { class: 'card-actions' }, [
        h('button', { class: 'mini', text: '수정', onClick: () => edit(r) }),
        h('button', { class: 'mini danger', text: '삭제', onClick: () => remove(r) })
      ])
    ]);
  }

  async function edit(r) {
    const values = await formModal({
      title: r ? `${tab.label} 수정` : `새 ${tab.label}`,
      fields: [
        { name: tab.titleField, label: tab.titleLabel + ' *', value: r?.[tab.titleField] },
        { name: 'category', label: '카테고리', value: r?.category },
        { name: tab.descField, label: tab.descLabel, type: 'textarea', rows: 4, value: r?.[tab.descField] }
      ]
    });
    if (!values) return;
    if (!String(values[tab.titleField] || '').trim()) { toast(`${tab.titleLabel}은(는) 필수입니다.`, 'err'); return; }
    if (r) await guard(tab.api().update(r.id, values), '수정되었습니다.');
    else await guard(tab.api().create(values), '추가되었습니다.');
    renderWorld(section);
  }

  async function remove(r) {
    if (!await confirmDialog(`"${r[tab.titleField]}" 항목을 삭제할까요?`)) return;
    await guard(tab.api().remove(r.id), '삭제되었습니다.');
    renderWorld(section);
  }
}
