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

// 端末ごとの状態(同期しない)
const DEFAULT_LOCAL = {
  lastOpenedId: null,
  view: ALL,
};

const lyrics = new Map();
let settings = structuredClone(DEFAULT_SETTINGS);
let local = structuredClone(DEFAULT_LOCAL);

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
  const [allLyrics, savedSettings, savedLocal] = await Promise.all([
    db.getAll('lyrics'),
    db.get('kv', 'settings'),
    db.get('kv', 'local'),
  ]);
  for (const l of allLyrics) lyrics.set(l.id, l);
  settings = { ...structuredClone(DEFAULT_SETTINGS), ...savedSettings };
  local = { ...structuredClone(DEFAULT_LOCAL), ...savedLocal };
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

// view: ALL / UNFILED / フォルダ名。order の小さい順(新しく作ったものが上)
export function listLyrics(view) {
  const all = [...lyrics.values()];
  const filtered = view === ALL ? all : all.filter((l) => l.folder === view);
  return filtered.sort((a, b) => a.order - b.order);
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
    order: orders.length ? Math.min(...orders) - 1 : 0,
    grammarIgnored: [],
    createdAt: now,
    updatedAt: now,
  };
  lyrics.set(lyric.id, lyric);
  persist(db.put('lyrics', lyric));
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
  const onlyCursor = Object.keys(patch).every((k) => k === 'cursor');
  if (!onlyCursor) emit('lyrics');
}

// 一覧に並んだ順(ids)に並べ替える。ids の歌詞がもともと使っていた order の値を並べ直すので、
// フォルダを見ているときも、ほかのフォルダの歌詞の順番は変わらない。「最後に書いた日」は変えない。
export function reorderLyrics(ids) {
  const items = ids.map((id) => lyrics.get(id)).filter(Boolean);
  const slots = items.map((l) => l.order).sort((a, b) => a - b);
  items.forEach((l, i) => {
    if (l.order === slots[i]) return;
    l.order = slots[i];
    persist(db.put('lyrics', l));
  });
  emit('lyrics');
}

export function deleteLyric(id) {
  if (!lyrics.delete(id)) return;
  persist(db.remove('lyrics', id));
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
  saveSettings();
  emit('folders');
  return null;
}

export function renameFolder(oldName, rawName) {
  const name = rawName.trim();
  if (name === oldName) return null;
  const problem = checkFolderName(name, oldName);
  if (problem) return problem;
  settings.folders = settings.folders.map((f) => (f === oldName ? name : f));
  saveSettings();
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
  saveSettings();
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
  saveSettings();
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
