// 歌詞・設定・端末ごとの状態を持つ場所。
// 画面の部品はここを通して読み書きし、変更は on() で受け取る。

import * as db from './db.js';

export const UNFILED = '未分類'; // 消せない特別なフォルダ
export const ALL = 'すべて'; // 一覧の表示だけに使う(フォルダではない)

const DEFAULT_SETTINGS = {
  theme: 'light',
  folders: ['愛海', '創'],
  tags: ['(Intro)', '(Verse)', '(Pre-Chorus)', '(Chorus)', '(Bridge)', '(Outro)'],
  // 「AIに聞く」の質問。{selection} は選んだ行、{lyrics} は歌詞全体に置き換わる
  aiPrompts: [
    { label: '自然か・ニュアンス', template: 'この英語の歌詞は自然ですか? ニュアンスも教えて:\n{selection}' },
    {
      label: '韻を踏みやすい言い換え',
      template: '次の英語の歌詞と同じ意味で、韻を踏みやすい言い換えを5つ教えて:\n{selection}',
    },
    {
      label: '歌詞全体を見て自然か',
      template: '次の英語の歌詞全体を見て、この行が自然か教えて:\n{selection}\n\n歌詞全体:\n{lyrics}',
    },
  ],
};

// 同期する設定(theme は端末ごとなので入れない)
const SYNCED_SETTINGS = ['folders', 'tags', 'aiPrompts', 'updatedAt'];

// 端末ごとの状態(同期しない)
const DEFAULT_LOCAL = {
  lastOpenedId: null,
  view: ALL,
  sync: { owner: 'Creative-Hues', repo: 'lyrics-data', lastSyncedAt: null },
};

// 同期のための印(端末の中だけに置く)
// lyrics:   歌詞ごとの { sha: 前回の同期のときのGitHub側の版, dirty: そのあとこちらで変えた回数(0なら変えていない) }
// deleted:  こちらで削除して、まだGitHubから消していない歌詞 { id: 削除したときのGitHub側の版 }
// settings: 設定の { sha, dirty }
const DEFAULT_SYNC_META = { lyrics: {}, deleted: {}, settings: { sha: null, dirty: 0 } };

const lyrics = new Map();
let settings = structuredClone(DEFAULT_SETTINGS);
let local = structuredClone(DEFAULT_LOCAL);
let syncMeta = structuredClone(DEFAULT_SYNC_META);

// ---- 変更の知らせ ----

const events = new EventTarget();

export function on(type, fn) {
  events.addEventListener(type, (e) => fn(e.detail));
}

function emit(type, detail) {
  events.dispatchEvent(new CustomEvent(type, { detail }));
}

// 保存に失敗したことを画面に知らせる
function persist(promise) {
  promise.catch((err) => {
    console.error(err);
    emit('error', '保存に失敗しました');
  });
}

// ---- 起動 ----

export async function init() {
  const [allLyrics, savedSettings, savedLocal, savedMeta] = await Promise.all([
    db.getAll('lyrics'),
    db.get('kv', 'settings'),
    db.get('kv', 'local'),
    db.get('kv', 'syncMeta'),
  ]);
  for (const l of allLyrics) lyrics.set(l.id, l);
  settings = { ...structuredClone(DEFAULT_SETTINGS), ...savedSettings };
  local = { ...structuredClone(DEFAULT_LOCAL), ...savedLocal };
  local.sync = { ...DEFAULT_LOCAL.sync, ...local.sync };
  syncMeta = { ...structuredClone(DEFAULT_SYNC_META), ...savedMeta };
  if (local.view !== ALL && local.view !== UNFILED && !settings.folders.includes(local.view)) {
    local.view = ALL;
  }
}

// ---- 日時と id ----

function pad(n) {
  return String(n).padStart(2, '0');
}

// 例: 2026-09-27T12:30:00+09:00
export function nowISO() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

// 例: lyric_20260927_a3f9(2台で同じ日に作っても重ならないよう、末尾はランダム)
function newId() {
  const d = new Date();
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id;
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const rand = Array.from(bytes, (b) => chars[b % chars.length]).join('');
    id = `lyric_${date}_${rand}`;
  } while (lyrics.has(id));
  return id;
}

// ---- 歌詞 ----

export function getLyric(id) {
  return lyrics.get(id) || null;
}

// view: ALL / UNFILED / フォルダ名。order の小さい順(新しく作ったものが上)。
// order が同じときは id の順にする(同期した2台で同じ並びになるように)
export function listLyrics(view) {
  const all = [...lyrics.values()];
  const filtered = view === ALL ? all : all.filter((l) => l.folder === view);
  return filtered.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function createLyric(folder) {
  const orders = [...lyrics.values()].map((l) => l.order);
  const now = nowISO();
  const lyric = {
    id: newId(),
    title: '無題',
    folder,
    body: '',
    memo: [],
    scratch: '',
    cursor: 0,
    // 2台で同時に作っても order が重ならないよう、少しずらす
    order: (orders.length ? Math.min(...orders) - 1 : 0) - Math.random() * 0.5,
    grammarIgnored: [],
    createdAt: now,
    updatedAt: now,
  };
  lyrics.set(lyric.id, lyric);
  persist(db.put('lyrics', lyric));
  markDirty(lyric.id);
  emit('lyrics');
  return lyric;
}

// touch: 「最後に書いた日」を更新するか(カーソル位置やフォルダ移動だけなら false)
export function updateLyric(id, patch, { touch = true } = {}) {
  const lyric = lyrics.get(id);
  if (!lyric) return;
  Object.assign(lyric, patch);
  if (touch) lyric.updatedAt = nowISO();
  persist(db.put('lyrics', lyric));
  // カーソル位置だけの変化は、同期で送るほどの変化にしない
  const onlyCursor = Object.keys(patch).every((k) => k === 'cursor');
  if (!onlyCursor) {
    markDirty(id);
    emit('lyrics');
  }
}

// 一覧に並んだ順(ids)に並べ替える。ids の歌詞がもともと使っていた order の値を並べ直すので、
// フォルダを見ているときも、ほかのフォルダの歌詞の順番は変わらない。「最後に書いた日」は変えない。
export function reorderLyrics(ids) {
  const items = ids.map((id) => lyrics.get(id)).filter(Boolean);
  const slots = items.map((l) => l.order).sort((a, b) => a - b);
  // 同じ order の歌詞があると並びを表せないので、少しずつずらす(同期した2台の歌詞で起こる)
  for (let i = 1; i < slots.length; i++) {
    if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1e-6;
  }
  items.forEach((l, i) => {
    if (l.order === slots[i]) return;
    l.order = slots[i];
    persist(db.put('lyrics', l));
    markDirty(l.id);
  });
  emit('lyrics');
}

export function deleteLyric(id) {
  if (!lyrics.delete(id)) return;
  persist(db.remove('lyrics', id));
  // 一度GitHubに送った歌詞なら、次の同期でGitHubからも消す
  const sha = syncMeta.lyrics[id]?.sha;
  delete syncMeta.lyrics[id];
  if (sha) syncMeta.deleted[id] = sha;
  saveSyncMeta();
  if (local.lastOpenedId === id) setLocal('lastOpenedId', null);
  emit('lyric-deleted', id);
  emit('lyrics');
}

// ---- 単語メモ ----

// 戻り値: 追加できたら true、もうあれば false
export function addMemo(id, word) {
  const lyric = lyrics.get(id);
  const w = word.trim();
  if (!lyric || !w) return false;
  if (lyric.memo.some((m) => m.toLowerCase() === w.toLowerCase())) return false;
  lyric.memo.push(w);
  updateLyric(id, { memo: lyric.memo });
  emit('memo', id);
  return true;
}

export function removeMemo(id, index) {
  const lyric = lyrics.get(id);
  if (!lyric) return;
  lyric.memo.splice(index, 1);
  updateLyric(id, { memo: lyric.memo });
  emit('memo', id);
}

// ---- 文法チェックで無視した指摘 ----

// 指摘の種類(rule)と単語(text)の組で覚える。大文字・小文字は区別しない
function ignoreKey(rule, text) {
  return `${rule}\u0000${text.toLowerCase()}`;
}

export function isGrammarIgnored(id, rule, text) {
  const list = lyrics.get(id)?.grammarIgnored || [];
  const key = ignoreKey(rule, text);
  return list.some((g) => ignoreKey(g.rule, g.text) === key);
}

export function addGrammarIgnore(id, rule, text) {
  const lyric = lyrics.get(id);
  if (!lyric || isGrammarIgnored(id, rule, text)) return;
  const list = [...(lyric.grammarIgnored || []), { rule, text }];
  updateLyric(id, { grammarIgnored: list });
}

// ---- フォルダ ----

export function getFolders() {
  return [...settings.folders];
}

// 戻り値: 問題があればその理由の文、なければ null
function checkFolderName(name, except) {
  if (!name) return 'フォルダ名を入れてください';
  if (name === ALL || name === UNFILED) return `「${name}」は使えない名前です`;
  if (name !== except && settings.folders.includes(name)) return `「${name}」はもうあります`;
  return null;
}

export function addFolder(rawName) {
  const name = rawName.trim();
  const problem = checkFolderName(name);
  if (problem) return problem;
  settings.folders.push(name);
  touchSettings();
  emit('folders');
  return null;
}

export function renameFolder(oldName, rawName) {
  const name = rawName.trim();
  if (name === oldName) return null;
  const problem = checkFolderName(name, oldName);
  if (problem) return problem;
  settings.folders = settings.folders.map((f) => (f === oldName ? name : f));
  touchSettings();
  for (const l of lyrics.values()) {
    if (l.folder === oldName) updateLyric(l.id, { folder: name }, { touch: false });
  }
  if (local.view === oldName) setLocal('view', name);
  emit('folders');
  return null;
}

// 中の歌詞は消さずに「未分類」へ移す
export function deleteFolder(name) {
  settings.folders = settings.folders.filter((f) => f !== name);
  touchSettings();
  for (const l of lyrics.values()) {
    if (l.folder === name) updateLyric(l.id, { folder: UNFILED }, { touch: false });
  }
  if (local.view === name) setLocal('view', ALL);
  emit('folders');
}

// ---- 設定 ----

function saveSettings() {
  persist(db.put('kv', settings, 'settings'));
}

// 同期する設定(フォルダ・タグ・質問)を変えたとき
function touchSettings() {
  settings.updatedAt = nowISO();
  syncMeta.settings.dirty += 1;
  saveSyncMeta();
  saveSettings();
}

export function getTheme() {
  return settings.theme;
}

export function setTheme(theme) {
  settings.theme = theme;
  saveSettings();
  emit('settings');
}

export function getTags() {
  return [...settings.tags];
}

export function getAiPrompts() {
  return settings.aiPrompts.map((p) => ({ ...p }));
}

export function setTags(tags) {
  settings.tags = [...tags];
  touchSettings();
  emit('tags');
}

// ---- 端末ごとの状態 ----

export function getLocal(key) {
  return local[key];
}

export function setLocal(key, value) {
  local[key] = value;
  persist(db.put('kv', local, 'local'));
}

// ---- GitHubのトークン(端末の中だけに置く。設定にも同期データにも入れない) ----

export async function getToken() {
  return (await db.get('kv', 'githubToken')) || '';
}

export function setToken(token) {
  return token ? db.put('kv', token, 'githubToken') : db.remove('kv', 'githubToken');
}

// ---- 同期から使う読み書き(js/sync.js) ----

function saveSyncMeta() {
  persist(db.put('kv', syncMeta, 'syncMeta'));
}

function markDirty(id) {
  const m = (syncMeta.lyrics[id] ||= { sha: null, dirty: 0 });
  m.dirty += 1;
  saveSyncMeta();
}

export function getSyncMeta() {
  return syncMeta;
}

// 同期先を変えたとき: 前の同期先の版の記録は使えないので、全部を「まだ送っていない」ことにする
export function resetSyncMeta() {
  syncMeta = structuredClone(DEFAULT_SYNC_META);
  for (const id of lyrics.keys()) syncMeta.lyrics[id] = { sha: null, dirty: 1 };
  syncMeta.settings.dirty = 1;
  saveSyncMeta();
}

// 送った・取ってきたあとに、GitHub側の版を覚える。
// dirtyWas: 送る前の dirty。送っている間にまた書いていたら、「変えた」の印は残す
export function setLyricSynced(id, sha, dirtyWas) {
  // 送っている間に、この端末で削除されていた: GitHubから消すときに使う版を新しくする
  if (!lyrics.has(id)) {
    if (syncMeta.deleted[id]) syncMeta.deleted[id] = sha;
    saveSyncMeta();
    return;
  }
  const m = (syncMeta.lyrics[id] ||= { sha: null, dirty: 0 });
  m.sha = sha;
  if (dirtyWas === undefined || m.dirty === dirtyWas) m.dirty = 0;
  saveSyncMeta();
}

export function clearDeleted(id) {
  delete syncMeta.deleted[id];
  saveSyncMeta();
}

export function setSettingsSynced(sha, dirtyWas) {
  syncMeta.settings.sha = sha;
  if (dirtyWas === undefined || syncMeta.settings.dirty === dirtyWas) syncMeta.settings.dirty = 0;
  saveSyncMeta();
}

// GitHubに置く形の歌詞
export function lyricForSync(id) {
  const l = lyrics.get(id);
  return l ? structuredClone(l) : null;
}

// GitHubから取ってきた歌詞で置き換える(「変えた」の印はつけない)。
// カーソル位置は、この端末の位置のままにする
export function putLyricFromSync(remote) {
  const old = lyrics.get(remote.id);
  const lyric = { ...remote, cursor: old ? old.cursor : remote.cursor || 0 };
  lyrics.set(lyric.id, lyric);
  persist(db.put('lyrics', lyric));
  emit('lyric-replaced', lyric.id);
  emit('lyrics');
}

// GitHubで消された歌詞を、この端末からも消す
export function removeLyricFromSync(id) {
  if (!lyrics.delete(id)) return;
  persist(db.remove('lyrics', id));
  delete syncMeta.lyrics[id];
  saveSyncMeta();
  if (local.lastOpenedId === id) setLocal('lastOpenedId', null);
  emit('lyric-deleted', id);
  emit('lyrics');
}

// 一覧で below のすぐ下に来る order(below と、その次の歌詞のあいだ)
function orderJustBelow(below) {
  const next = Math.min(...[...lyrics.values()].map((l) => l.order).filter((o) => o > below.order), below.order + 1);
  return (below.order + next) / 2;
}

// ぶつかったときに、古いほうを新しい id の「コピー」として残す。一覧では元の歌詞のすぐ下に置く
export function addLyricCopy(from, below) {
  const d = new Date(from.updatedAt);
  const stamp = `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const lyric = {
    ...structuredClone(from),
    id: newId(),
    title: `${from.title || '無題'}(コピー ${stamp})`,
    order: orderJustBelow(below),
  };
  lyrics.set(lyric.id, lyric);
  persist(db.put('lyrics', lyric));
  markDirty(lyric.id);
  emit('lyrics');
  return lyric;
}

export function settingsForSync() {
  return Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, structuredClone(settings[k])]));
}

// GitHubから取ってきた設定で置き換える(「変えた」の印はつけない)
export function putSettingsFromSync(remote) {
  for (const k of SYNCED_SETTINGS) {
    if (remote[k] !== undefined) settings[k] = structuredClone(remote[k]);
  }
  saveSettings();
  afterSettingsChanged();
}

// はじめて同期するとき: どちらかにあるフォルダ・タグ・質問を全部残す。合わせた結果は「変えた」ことにする
export function mergeSettingsFromSync(remote) {
  const union = (a = [], b = [], key = (x) => x) => {
    const seen = new Set(a.map(key));
    return [...a, ...b.filter((x) => !seen.has(key(x)))];
  };
  settings.folders = union(remote.folders, settings.folders);
  settings.tags = union(remote.tags, settings.tags);
  settings.aiPrompts = union(remote.aiPrompts, settings.aiPrompts, (p) => p.label);
  touchSettings();
  afterSettingsChanged();
}

// 歌詞が入っているのに一覧にないフォルダを足す。足したら true
export function addMissingFolders() {
  const missing = [];
  for (const l of lyrics.values()) {
    if (l.folder !== UNFILED && !settings.folders.includes(l.folder) && !missing.includes(l.folder)) {
      missing.push(l.folder);
    }
  }
  if (!missing.length) return false;
  settings.folders.push(...missing);
  touchSettings();
  afterSettingsChanged();
  return true;
}

function afterSettingsChanged() {
  if (local.view !== ALL && local.view !== UNFILED && !settings.folders.includes(local.view)) {
    setLocal('view', ALL);
  }
  emit('folders');
  emit('tags');
}

// 同期のようすを画面に知らせる
export function emitSync(detail) {
  emit('sync', detail);
}
