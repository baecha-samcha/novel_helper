import { h, guard, formModal, confirmDialog, toast } from '../ui.js';

export async function renderTimeline(section) {
  section.innerHTML = '';
  const [events, chars] = await Promise.all([
    window.api.events.list(),
    window.api.chars.list()
  ]);

  section.append(h('div', { class: 'view-header' }, [
    h('h2', { text: `타임라인 (${events.length})` }),
    h('div', { class: 'tools' }, [
      h('button', { class: 'primary', text: '+ 사건 추가', onClick: () => edit(null) })
    ])
  ]));

  if (!events.length) {
    section.append(h('div', { class: 'empty', text: '사건이 없습니다. 작중 시간순으로 사건을 배치해보세요.' }));
    return;
  }

  const tl = h('div', { class: 'timeline' });
  for (const e of events) tl.append(item(e));
  section.append(tl);

  function item(e) {
    const tags = (e.characters || []).map(c => h('span', { class: 'chip', text: c.name }));
    return h('div', { class: 'tl-item' }, [
      h('div', { class: 'tl-time', text: e.story_time || '(시간 미지정)' }),
      h('div', { class: 'tl-card' }, [
        h('h4', { text: e.title }),
        e.description && h('div', { class: 'tl-desc', text: e.description }),
        tags.length ? h('div', { style: 'margin-top:8px;' }, tags) : null,
        h('div', { class: 'card-actions', style: 'margin-top:10px;' }, [
          h('button', { class: 'mini', text: '수정', onClick: () => edit(e) }),
          h('button', { class: 'mini danger', text: '삭제', onClick: () => remove(e) })
        ])
      ])
    ]);
  }

  async function edit(e) {
    const selected = new Set((e?.characters || []).map(c => c.id));
    const picker = {
      render() {
        const wrap = h('div', { class: 'tag-picker' });
        if (!chars.length) {
          wrap.append(h('span', { class: 'meta', text: '먼저 인물을 등록하세요.' }));
        }
        for (const c of chars) {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = selected.has(c.id);
          cb.addEventListener('change', () => {
            if (cb.checked) selected.add(c.id); else selected.delete(c.id);
          });
          wrap.append(h('label', {}, [cb, c.name]));
        }
        return { el: wrap, getValue: () => [...selected] };
      }
    };

    const values = await formModal({
      title: e ? '사건 수정' : '새 사건',
      fields: [
        { name: 'title', label: '사건명 *', value: e?.title },
        { name: 'story_time', label: '작중 시간 (예: 1권 3장 / 서기 1204년 봄)', value: e?.story_time },
        { name: 'sort_order', label: '정렬 순서 (숫자, 작을수록 먼저)', type: 'number', value: e?.sort_order },
        { name: 'description', label: '내용', type: 'textarea', rows: 4, value: e?.description },
        { name: 'character_ids', label: '관련 인물', type: 'custom', render: picker.render }
      ]
    });
    if (!values) return;
    if (!values.title.trim()) { toast('사건명은 필수입니다.', 'err'); return; }
    values.sort_order = values.sort_order === '' ? null : Number(values.sort_order);
    if (e) await guard(window.api.events.update(e.id, values), '수정되었습니다.');
    else await guard(window.api.events.create(values), '추가되었습니다.');
    renderTimeline(section);
  }

  async function remove(e) {
    if (!await confirmDialog(`"${e.title}" 사건을 삭제할까요?`)) return;
    await guard(window.api.events.remove(e.id), '삭제되었습니다.');
    renderTimeline(section);
  }
}
