import { h, guard, formModal, confirmDialog, toast } from '../ui.js';

let network = null;

export async function renderGraph(section) {
  if (network) { try { network.destroy(); } catch (_) {} network = null; }
  section.innerHTML = '';

  const [chars, rels] = await Promise.all([
    window.api.chars.list(),
    window.api.rels.list()
  ]);

  section.append(h('div', { class: 'view-header' }, [
    h('h2', { text: '인물 관계도' }),
    h('div', { class: 'tools' }, [
      h('span', { class: 'graph-legend', text: '노드 드래그로 배치 · 관계선 클릭=수정 · 우클릭=삭제' }),
      h('button', { text: '🔗 관계 추가', class: 'primary', onClick: () => editRel(null) })
    ])
  ]));

  const canvas = h('div', { id: 'graph-canvas' });
  section.append(canvas);

  if (!chars.length) {
    canvas.append(h('div', { class: 'empty', text: '먼저 인물 탭에서 인물을 등록하세요.' }));
    return;
  }

  const charById = new Map(chars.map(c => [c.id, c]));

  const nodes = new vis.DataSet(chars.map((c, i) => ({
    id: c.id,
    label: c.name,
    shape: c.image ? 'circularImage' : 'dot',
    image: c.image || undefined,
    size: c.image ? 26 : 18,
    x: c.pos_x != null ? c.pos_x : undefined,
    y: c.pos_y != null ? c.pos_y : undefined,
    fixed: false
  })));

  const edges = new vis.DataSet(rels.map(r => ({
    id: r.id,
    from: r.from_character_id,
    to: r.to_character_id,
    label: r.label || '',
    arrows: r.directed ? 'to' : { to: false, from: false }
  })));

  network = new vis.Network(canvas, { nodes, edges }, {
    locale: 'ko',
    nodes: {
      color: { background: '#7c6cff', border: '#5c4ddb', highlight: { background: '#9a8cff', border: '#7c6cff' } },
      font: { color: '#e6e6ec', size: 15, face: 'Segoe UI' },
      borderWidth: 2
    },
    edges: {
      color: { color: '#8a8a9a', highlight: '#7c6cff' },
      font: { color: '#cfc8ff', size: 13, strokeWidth: 4, strokeColor: '#1e1e24', background: 'rgba(30,30,36,.6)' },
      smooth: { type: 'dynamic' },
      width: 1.5
    },
    physics: {
      enabled: true,
      stabilization: { iterations: 120 },
      barnesHut: { gravitationalConstant: -6000, springLength: 160, springConstant: 0.03 }
    },
    interaction: { hover: true, multiselect: false }
  });

  // 최초 안정화 후 물리엔진 정지 (수동 배치 유지)
  network.once('stabilizationIterationsDone', () => {
    network.setOptions({ physics: { enabled: false } });
  });

  // 노드 드래그 → 위치 저장
  network.on('dragEnd', async (params) => {
    for (const id of params.nodes) {
      const pos = network.getPositions([id])[id];
      if (pos) {
        try { await window.api.chars.setPosition(id, pos.x, pos.y); } catch (_) {}
      }
    }
  });

  // 관계선 클릭 → 수정
  network.on('selectEdge', (params) => {
    if (params.nodes.length) return; // 노드 선택이 우선
    const id = params.edges[0];
    const rel = rels.find(r => r.id === id);
    if (rel) editRel(rel);
    network.unselectAll();
  });

  // 관계선 우클릭 → 삭제
  network.on('oncontext', async (params) => {
    params.event.preventDefault();
    const edgeId = network.getEdgeAt(params.pointer.DOM);
    const rel = edgeId != null && rels.find(r => r.id === edgeId);
    if (!rel) return;
    const a = charById.get(rel.from_character_id)?.name || '?';
    const b = charById.get(rel.to_character_id)?.name || '?';
    if (await confirmDialog(`관계 "${a} — ${b}" (${rel.label || '무제'}) 를 삭제할까요?`)) {
      await guard(window.api.rels.remove(rel.id), '관계가 삭제되었습니다.');
      renderGraph(section);
    }
  });

  async function editRel(rel) {
    const options = chars.map(c => ({ value: c.id, label: c.name }));
    const values = await formModal({
      title: rel ? '관계 수정' : '새 관계',
      fields: [
        { name: 'from_character_id', label: '시작 인물', type: 'select', options, value: rel?.from_character_id ?? chars[0].id },
        { name: 'to_character_id', label: '대상 인물', type: 'select', options, value: rel?.to_character_id ?? (chars[1]?.id ?? chars[0].id) },
        { name: 'label', label: '관계 라벨 (예: 연인, 원수, 가족)', value: rel?.label },
        { name: 'directed', label: '방향성', type: 'select',
          value: rel ? (rel.directed ? '1' : '0') : '1',
          options: [{ value: '1', label: '방향 있음 (시작 → 대상)' }, { value: '0', label: '양방향 / 무방향' }] }
      ],
      submitLabel: rel ? '저장' : '추가'
    });
    if (!values) return;

    const from = Number(values.from_character_id);
    const to = Number(values.to_character_id);
    if (from === to) { toast('서로 다른 인물을 선택하세요.', 'err'); return; }

    const payload = { from_character_id: from, to_character_id: to, label: values.label, directed: values.directed === '1' };

    if (rel) {
      // from/to 변경 시 재생성이 필요하므로 삭제 후 생성
      if (from !== rel.from_character_id || to !== rel.to_character_id) {
        await guard(window.api.rels.remove(rel.id));
        await guard(window.api.rels.create(payload), '관계가 수정되었습니다.');
      } else {
        await guard(window.api.rels.update(rel.id, payload), '관계가 수정되었습니다.');
      }
    } else {
      await guard(window.api.rels.create(payload), '관계가 추가되었습니다.');
    }
    renderGraph(section);
  }
}
