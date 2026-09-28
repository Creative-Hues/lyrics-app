// GitHubのプライベートリポジトリとの同期(SPEC 7章)。
// リポジトリの中身: lyrics/歌詞のid.json(1曲1ファイル)と settings.json(フォルダ・タグ・質問)。
//
// 各歌詞について「前回の同期のときのGitHub側の版(sha)」と「そのあとこちらで変えたか(dirty)」を
// store が覚えていて、GitHub側の今の版と比べて、送る・取ってくる・ぶつかった を決める。

import * as store from './store.js';
import { createGitHub, GitHubError } from './api/github.js';

const LYRIC_DIR = 'lyrics';
const SETTINGS_FILE = 'settings.json';
const AUTO_INTERVAL = 60 * 1000; // アプリに戻ってきたとき、前回からこれ以上たっていたら同期する

let flushEdits = () => {}; // 書きかけの内容を保存する(エディタ・こねこね欄)
let running = null; // 今動いている同期(2つ同時には動かさない)
let lastRunAt = 0;
let checkedPrivate = false; // この起動のあいだに、リポジトリがプライベートだと確かめたか

class SyncError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

const MESSAGES = {
  offline: 'オフラインのため同期できません',
  auth: 'トークンが正しくないか、期限が切れています。「同期の設定」で入れ直してください',
  forbidden: 'このトークンでは書きこめません。トークンの権限「Contents」を「Read and write」にしてください',
  notfound: 'リポジトリが見つかりません。持ち主・名前と、トークンの対象のリポジトリを確かめてください',
  public: 'リポジトリが公開になっているため、同期しませんでした。GitHubでプライベートにしてください',
  limit: '短い時間に同期しすぎました。少し待ってから、もう一度押してください',
  unset: '同期の設定がまだです',
  other: 'GitHubにつながりませんでした。もう一度押してください',
};

export function errorMessage(err) {
  return MESSAGES[err?.kind] || MESSAGES.other;
}

// ---- 準備 ----

async function connect() {
  const token = await store.getToken();
  const { owner, repo } = store.getLocal('sync');
  if (!token || !owner || !repo) return null;
  return createGitHub({ owner, repo, token });
}

export async function isConfigured() {
  return (await connect()) !== null;
}

// 歌詞を書きかけのまま同期しないよう、先に保存する係を受け取る
export function setupSync({ flush }) {
  flushEdits = flush;
}

// 設定画面の「接続を試す」。戻り値: 問題なければ null、あれば理由の文
export async function testConnection({ owner, repo, token }) {
  try {
    const info = await createGitHub({ owner, repo, token }).getRepo();
    if (!info.private) return MESSAGES.public;
    if (info.permissions && !info.permissions.push) return MESSAGES.forbidden;
    return null;
  } catch (err) {
    // 設定画面の中なので、「設定で入れ直して」は言わない
    return err.kind === 'auth' ? 'トークンが正しくないか、期限が切れています' : errorMessage(err);
  }
}

// ---- 形の変換 ----

const lyricPath = (id) => `${LYRIC_DIR}/${id}.json`;
const toText = (obj) => JSON.stringify(obj, null, 2) + '\n';

// 書いた中身(タイトル・本文・単語メモ・こねこね欄・文法の無視)が同じか。並び順やフォルダは見ない
function sameWriting(a, b) {
  const pick = (l) => JSON.stringify([l.title, l.body, l.memo, l.scratch, l.grammarIgnored || []]);
  return pick(a) === pick(b);
}

const time = (iso) => Date.parse(iso || '') || 0;

async function readLyric(gh, id) {
  const file = await gh.read(lyricPath(id));
  if (!file) return null;
  try {
    const lyric = JSON.parse(file.text);
    if (lyric.id !== id || typeof lyric.body !== 'string') return null;
    return { lyric: { memo: [], scratch: '', grammarIgnored: [], ...lyric }, sha: file.sha };
  } catch {
    return null; // 壊れたファイルは読まない
  }
}

// ---- 送る ----

// sha: GitHub側の今の版(新しく作るときは null)
async function pushLyric(gh, id, sha, result, opts) {
  const lyric = store.lyricForSync(id);
  if (!lyric) return;
  const dirtyWas = store.getSyncMeta().lyrics[id]?.dirty ?? 0;
  const newSha = await gh.write(lyricPath(id), toText(lyric), sha, `${lyric.title || '無題'} を保存`, opts);
  store.setLyricSynced(id, newSha, dirtyWas);
  result.sent += 1;
}

async function pushSettings(gh, sha, opts) {
  const dirtyWas = store.getSyncMeta().settings.dirty;
  const newSha = await gh.write(SETTINGS_FILE, toText(store.settingsForSync()), sha, '設定を保存', opts);
  store.setSettingsSynced(newSha, dirtyWas);
}

// 送っている途中でGitHub側が変わっていたとき(ほかの端末が同時に同期した)は、次の同期に回す
async function laterIfConflict(promise, result) {
  try {
    await promise;
  } catch (err) {
    if (!(err instanceof GitHubError) || err.kind !== 'conflict') throw err;
    result.later += 1;
  }
}

// ---- 設定の同期 ----

async function syncSettings(gh, result) {
  const meta = store.getSyncMeta().settings;
  const remote = await gh.read(SETTINGS_FILE);
  if (!remote) return pushSettings(gh, null);
  if (remote.sha === meta.sha) {
    if (meta.dirty) await pushSettings(gh, remote.sha);
    return;
  }
  let data = null;
  try {
    data = JSON.parse(remote.text);
  } catch {
    // 壊れていたら、こちらの設定で直す
  }
  if (!data || !Array.isArray(data.folders)) return pushSettings(gh, remote.sha);

  if (!meta.sha) {
    // はじめての同期: どちらかにあるものを全部残す
    store.mergeSettingsFromSync(data);
    return pushSettings(gh, remote.sha);
  }
  if (!meta.dirty || time(data.updatedAt) >= time(store.settingsForSync().updatedAt)) {
    store.putSettingsFromSync(data);
    store.setSettingsSynced(remote.sha);
    return;
  }
  await pushSettings(gh, remote.sha); // こちらのほうが新しい
}

// ---- 歌詞1曲の同期 ----

async function syncLyric(gh, id, remoteSha, result) {
  const meta = store.getSyncMeta();

  // この端末で削除した歌詞
  if (id in meta.deleted) {
    const base = meta.deleted[id];
    if (remoteSha === base) {
      try {
        await gh.remove(lyricPath(id), base, `${id} を削除`);
        store.clearDeleted(id);
        result.sent += 1;
      } catch (err) {
        // 途中でGitHub側が変わった: 印を残し、次の同期で「書き足されていた」として扱う
        if (err.kind === 'conflict') result.later += 1;
        else if (err.kind === 'notfound') store.clearDeleted(id);
        else throw err;
      }
      return;
    }
    store.clearDeleted(id);
    if (!remoteSha) return;
    // 削除する前に、ほかの端末で書き足されていた: 消さずに取ってくる(下へ続く)
  }

  const m = meta.lyrics[id] || { sha: null, dirty: 0 };

  // GitHubにしかない: 取ってくる
  if (!store.getLyric(id)) {
    if (!remoteSha) return;
    const remote = await readLyric(gh, id);
    if (!remote || store.getLyric(id)) return;
    store.putLyricFromSync(remote.lyric);
    store.setLyricSynced(id, remote.sha);
    result.received += 1;
    return;
  }

  // この端末にしかない
  if (!remoteSha) {
    if (m.sha && !m.dirty) {
      // 前に送ったのに、GitHubから消えている: ほかの端末で削除された
      store.removeLyricFromSync(id);
      result.removed += 1;
    } else {
      // まだ送っていない、またはほかの端末で削除されたあとにこちらで書き足した: 送る
      await laterIfConflict(pushLyric(gh, id, null, result), result);
    }
    return;
  }

  // GitHub側は前回のまま
  if (remoteSha === m.sha) {
    if (m.dirty) await laterIfConflict(pushLyric(gh, id, remoteSha, result), result);
    return;
  }

  // GitHub側が変わっている
  const remote = await readLyric(gh, id);
  if (!remote) return;
  flushEdits(); // 書きかけを保存してから比べる
  const cur = store.lyricForSync(id);
  if (!cur) return; // 読んでいる間に削除された(次の同期で扱う)
  const dirty = store.getSyncMeta().lyrics[id]?.dirty ?? 0;

  if (!dirty) {
    store.putLyricFromSync(remote.lyric);
    store.setLyricSynced(id, remote.sha);
    result.received += 1;
    return;
  }
  if (sameWriting(cur, remote.lyric)) {
    // 中身は同じ(並び順やフォルダだけ違う): こちらのものを送る
    await laterIfConflict(pushLyric(gh, id, remote.sha, result), result);
    return;
  }

  // ぶつかった: 新しいほうを元の歌詞として残し、古いほうをコピーにする
  result.conflicts += 1;
  if (time(remote.lyric.updatedAt) > time(cur.updatedAt)) {
    const copy = store.addLyricCopy(cur, remote.lyric);
    store.putLyricFromSync(remote.lyric);
    store.setLyricSynced(id, remote.sha);
    result.replaced.push(id);
    await laterIfConflict(pushLyric(gh, copy.id, null, result), result);
  } else {
    const copy = store.addLyricCopy(remote.lyric, cur);
    await laterIfConflict(pushLyric(gh, id, remote.sha, result), result);
    await laterIfConflict(pushLyric(gh, copy.id, null, result), result);
  }
}

// ---- 全体の同期 ----

async function fullSync(gh) {
  const result = { sent: 0, received: 0, removed: 0, conflicts: 0, later: 0, replaced: [] };

  const info = await gh.getRepo();
  if (!info.private) throw new SyncError('public');
  checkedPrivate = true;

  flushEdits();
  await syncSettings(gh, result);

  const remote = new Map();
  for (const f of await gh.list(LYRIC_DIR)) {
    const m = /^(lyric_[\w-]+)\.json$/.exec(f.name);
    if (m) remote.set(m[1], f.sha);
  }
  const ids = new Set([
    ...store.listLyrics(store.ALL).map((l) => l.id),
    ...remote.keys(),
    ...Object.keys(store.getSyncMeta().deleted),
  ]);
  for (const id of ids) await syncLyric(gh, id, remote.get(id) ?? null, result);

  // 歌詞が入っているのに一覧にないフォルダを足して、設定も送り直す
  if (store.addMissingFolders()) await syncSettings(gh, result);

  store.setLocal('sync', { ...store.getLocal('sync'), lastSyncedAt: store.nowISO() });
  return result;
}

// アプリから離れるとき: こちらで変えた分だけを送る。取ってくるのは次に開いたとき
async function pushOnly(gh) {
  const result = { sent: 0, later: 0 };
  const opts = { keepalive: true }; // ページが裏に回っても、送り終えられるようにする
  flushEdits();
  const meta = store.getSyncMeta();
  for (const [id, base] of Object.entries(meta.deleted)) {
    try {
      await gh.remove(lyricPath(id), base, `${id} を削除`, opts);
      store.clearDeleted(id);
    } catch (err) {
      if (err.kind === 'notfound') store.clearDeleted(id);
      else if (err.kind !== 'conflict') throw err;
    }
  }
  for (const [id, m] of Object.entries(meta.lyrics)) {
    if (m.dirty && store.getLyric(id)) await laterIfConflict(pushLyric(gh, id, m.sha, result, opts), result);
  }
  if (meta.settings.dirty && meta.settings.sha) {
    await laterIfConflict(pushSettings(gh, meta.settings.sha, opts), result);
  }
  return result;
}

function hasLocalChanges() {
  const meta = store.getSyncMeta();
  return (
    Object.keys(meta.deleted).length > 0 ||
    Object.values(meta.lyrics).some((m) => m.dirty) ||
    meta.settings.dirty > 0
  );
}

// ---- 呼び出し口 ----

// auto: 自動の同期(開いたとき・戻ってきたとき)。何も変わらなかったときや電波がないときは知らせない
export async function syncNow({ auto = false } = {}) {
  if (running) return running;
  running = (async () => {
    const gh = await connect();
    if (!gh) {
      if (!auto) store.emitSync({ state: 'error', auto, error: new SyncError('unset') });
      return;
    }
    lastRunAt = Date.now();
    store.emitSync({ state: 'running', auto });
    try {
      const result = await fullSync(gh);
      store.emitSync({ state: 'done', auto, result });
    } catch (err) {
      console.error(err);
      store.emitSync({ state: 'error', auto, error: err });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

// アプリに戻ってきたとき
export function syncIfStale() {
  if (Date.now() - lastRunAt >= AUTO_INTERVAL) syncNow({ auto: true });
}

// アプリから離れるとき
export async function pushChanges() {
  if (running || !checkedPrivate || !hasLocalChanges()) return;
  const gh = await connect();
  if (!gh) return;
  running = pushOnly(gh)
    .then(() => store.emitSync({ state: 'pushed' }))
    .catch((err) => console.error(err))
    .finally(() => {
      running = null;
    });
  return running;
}
