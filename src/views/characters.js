import { h, esc, toast, guard, formModal, confirmDialog } from '../ui.js';

export async function renderCharacters(section) {
  section.innerHTML = '';
  const list = await window.api.chars.list();

  const searchInput = h('input', {
    class: 'search-inline', placeholder: '이름/설정 필터…',
    oninput: () => paint(searchInput.value.trim())
  });

  section.append(h('div', { class: 'view-header' }, [
    h('h2', { text: `인물 (${list.length})` }),
    h('div', { class: 'tools' }, [
      searchInput,
      h('button', { class: 'primary', text: '+ 인물 추가', onClick: () => edit(null) })
    ])
  ]));

  const gridWrap = h('div');
  section.append(gridWrap);
  paint('');

  function paint(filter) {
    const f = filter.toLowerCase();
    const items = !f ? list : list.filter(c =>
      [c.name, c.affiliation, c.personality, c.appearance, c.secret, c.age]
        .some(v => (v || '').toLowerCase().includes(f)));

    gridWrap.innerHTML = '';
    if (!items.length) {
      gridWrap.append(h('div', { class: 'empty', text: '인물이 없습니다. "+ 인물 추가"로 시작하세요.' }));
      return;
    }
    const grid = h('div', { class: 'grid' });
    for (const c of items) grid.append(card(c));
    gridWrap.append(grid);
  }

  function card(c) {
    const avatar = c.image
      ? h('img', { class: 'avatar', src: c.image })
      : h('div', { class: 'avatar', text: '👤' });

    return h('div', { class: 'card' }, [
      h('div', { class: 'char-head' }, [
        avatar,
        h('div', {}, [
          h('h3', { text: c.name }),
          h('div', { class: 'meta', text: [c.age && `${c.age}`, c.affiliation].filter(Boolean).join(' · ') || '—' })
        ])
      ]),
      c.appearance && h('div', { class: 'row' }, [h('b', { text: '외모' }), c.appearance]),
      c.personality && h('div', { class: 'row' }, [h('b', { text: '성격' }), c.personality]),
      c.secret && h('div', { class: 'row', style: 'color:var(--danger)' }, [h('b', { text: '비밀' }), c.secret]),
      h('div', { class: 'card-actions' }, [
        h('button', { class: 'mini', text: '수정', onClick: () => edit(c) }),
        h('button', { class: 'mini danger', text: '삭제', onClick: () => remove(c) })
      ])
    ]);
  }

  async function edit(c) {
    const values = await formModal({
      title: c ? '인물 수정' : '새 인물',
      fields: [
        { name: 'name', label: '이름 *', value: c?.name },
        { name: 'age', label: '나이', value: c?.age },
        { name: 'affiliation', label: '소속', value: c?.affiliation },
        { name: 'appearance', label: '외모', type: 'textarea', value: c?.appearance },
        { name: 'personality', label: '성격', type: 'textarea', value: c?.personality },
        { name: 'secret', label: '비밀', type: 'textarea', value: c?.secret },
        { name: 'image', label: '이미지', type: 'image', value: c?.image }
      ]
    });
    if (!values) return;
    if (!values.name.trim()) { toast('이름은 필수입니다.', 'err'); return; }
    if (c) await guard(window.api.chars.update(c.id, values), '수정되었습니다.');
    else await guard(window.api.chars.create(values), '추가되었습니다.');
    renderCharacters(section);
  }

  async function remove(c) {
    if (!await confirmDialog(`"${c.name}" 인물을 삭제할까요? 관련 관계·태그도 함께 삭제됩니다.`)) return;
    await guard(window.api.chars.remove(c.id), '삭제되었습니다.');
    renderCharacters(section);
  }
}
