'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 모든 채널은 { ok, data, error } 형태를 반환.
// 렌더러에서는 실패 시 예외를 던지도록 언랩한다.
function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).then((res) => {
    if (res && res.ok) return res.data;
    throw new Error(res ? res.error : '알 수 없는 오류');
  });
}

contextBridge.exposeInMainWorld('api', {
  // DB 파일
  getDbPath: () => invoke('db:getPath'),
  newDb: () => invoke('db:new'),
  openDb: () => invoke('db:open'),

  // 백업
  exportDb: () => invoke('backup:exportDb'),
  importDb: () => invoke('backup:importDb'),
  exportJson: () => invoke('backup:exportJson'),

  // 이미지
  pickImage: () => invoke('image:pick'),

  // 인물
  chars: {
    list: () => invoke('char:list'),
    create: (c) => invoke('char:create', c),
    update: (id, c) => invoke('char:update', id, c),
    remove: (id) => invoke('char:remove', id),
    setPosition: (id, x, y) => invoke('char:setPosition', id, x, y)
  },

  // 관계
  rels: {
    list: () => invoke('rel:list'),
    create: (r) => invoke('rel:create', r),
    update: (id, r) => invoke('rel:update', id, r),
    remove: (id) => invoke('rel:remove', id)
  },

  // 장소 / 조직 / 용어
  locs: crud('loc'),
  orgs: crud('org'),
  glos: crud('glo'),

  // 사건
  events: {
    list: () => invoke('evt:list'),
    create: (e) => invoke('evt:create', e),
    update: (id, e) => invoke('evt:update', id, e),
    remove: (id) => invoke('evt:remove', id)
  },

  // 검색
  search: (q) => invoke('search:query', q)
});

function crud(ns) {
  return {
    list: () => invoke(`${ns}:list`),
    create: (row) => invoke(`${ns}:create`, row),
    update: (id, row) => invoke(`${ns}:update`, id, row),
    remove: (id) => invoke(`${ns}:remove`, id)
  };
}
