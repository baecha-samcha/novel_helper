// 공통 DOM/UI 헬퍼

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      el.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toast(msg, type = '') {
  const root = document.getElementById('toast-root');
  const t = h('div', { class: `toast ${type}`, text: msg });
  root.append(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// 오류를 감싸 실행하고 토스트로 보고
export async function guard(promise, okMsg) {
  try {
    const r = await promise;
    if (okMsg) toast(okMsg, 'ok');
    return r;
  } catch (e) {
    toast(e.message || String(e), 'err');
    throw e;
  }
}

/**
 * 모달 폼.
 * fields: [{ name, label, type, value, options?, rows?, span? }]
 * type: text | number | textarea | select | image | custom
 * 반환: 저장 시 값 객체, 취소 시 null (Promise)
 */
export function formModal({ title, fields, submitLabel = '저장' }) {
  return new Promise((resolve) => {
    const inputs = {};
    const body = h('div');

    for (const f of fields) {
      const field = h('div', { class: 'field' });
      if (f.label) field.append(h('label', { text: f.label }));
      let input;

      if (f.type === 'textarea') {
        input = h('textarea', { rows: f.rows || 3 });
        input.value = f.value || '';
      } else if (f.type === 'select') {
        input = h('select');
        for (const opt of f.options || []) {
          const o = h('option', { value: opt.value, text: opt.label });
          if (String(opt.value) === String(f.value)) o.selected = true;
          input.append(o);
        }
      } else if (f.type === 'image') {
        input = imageField(f.value);
      } else if (f.type === 'custom') {
        input = f.render();
      } else {
        input = h('input', { type: f.type || 'text' });
        input.value = f.value != null ? f.value : '';
      }

      inputs[f.name] = input;
      field.append(input.el || input);
      body.append(field);
    }

    const overlay = h('div', { class: 'modal-overlay' });
    const modal = h('div', { class: 'modal' }, [
      h('h3', { text: title }),
      body,
      h('div', { class: 'modal-actions' }, [
        h('button', { text: '취소', onClick: () => close(null) }),
        h('button', { class: 'primary', text: submitLabel, onClick: submit })
      ])
    ]);
    overlay.append(modal);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    document.getElementById('modal-root').append(overlay);

    // 첫 입력에 포커스
    const first = modal.querySelector('input, textarea, select');
    if (first) first.focus();

    function submit() {
      const out = {};
      for (const f of fields) {
        const inp = inputs[f.name];
        out[f.name] = inp.getValue ? inp.getValue() : inp.value;
      }
      close(out);
    }
    function close(val) {
      overlay.remove();
      resolve(val);
    }
  });
}

// 이미지 선택 필드 (data URL 저장)
function imageField(initial) {
  let value = initial || '';
  const preview = h('img', { class: 'avatar', style: 'width:80px;height:80px;' });
  const setPreview = () => {
    if (value) { preview.src = value; preview.textContent = ''; }
    else { preview.removeAttribute('src'); preview.textContent = '👤'; }
  };
  setPreview();

  const pickBtn = h('button', {
    text: '이미지 선택', type: 'button',
    onClick: async () => {
      const data = await window.api.pickImage();
      if (data) { value = data; setPreview(); }
    }
  });
  const clearBtn = h('button', {
    text: '제거', type: 'button',
    onClick: () => { value = ''; setPreview(); }
  });
  const wrap = h('div', { style: 'display:flex;gap:10px;align-items:center;' }, [
    preview,
    h('div', { style: 'display:flex;flex-direction:column;gap:6px;' }, [pickBtn, clearBtn])
  ]);
  return { el: wrap, getValue: () => value };
}

export async function confirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'modal-overlay' });
    overlay.append(h('div', { class: 'modal' }, [
      h('p', { text: message, style: 'margin:0 0 16px;' }),
      h('div', { class: 'modal-actions' }, [
        h('button', { text: '취소', onClick: () => { overlay.remove(); resolve(false); } }),
        h('button', { class: 'danger', text: '삭제', onClick: () => { overlay.remove(); resolve(true); } })
      ])
    ]));
    document.getElementById('modal-root').append(overlay);
  });
}
