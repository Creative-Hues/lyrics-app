// 同期の画面の部品: ヘッダーの「同期」ボタンと表示、「同期の設定」画面、同期の結果のお知らせ。

import * as store from '../store.js';
import { syncNow, isConfigured, testConnection, errorMessage } from '../sync.js';
import { toast, formatDateTime } from './util.js';

const TOKEN_PAGE = 'https://github.com/settings/personal-access-tokens/new';
const LONG = 4500; // 長めのお知らせを出す時間(ミリ秒)

export function createSyncUi({ status, syncButton, settingsButton, dialog }) {
  dialog.innerHTML = `
    <form method="dialog" class="sync-dialog">
      <h2 class="dialog-title">同期の設定</h2>
      <p class="dialog-note">
        歌詞をGitHubのプライベートリポジトリに置いて、PCとスマホで同じ歌詞を見られるようにします。
      </p>
      <label class="field">
        <span class="field-label">リポジトリの持ち主</span>
        <input type="text" name="owner" autocomplete="off" autocapitalize="off" spellcheck="false">
      </label>
      <label class="field">
        <span class="field-label">リポジトリ名</span>
        <input type="text" name="repo" autocomplete="off" autocapitalize="off" spellcheck="false">
      </label>
      <label class="field">
        <span class="field-label">トークン</span>
        <input type="password" name="token" autocomplete="off" autocapitalize="off" spellcheck="false">
      </label>
      <div class="token-saved" hidden>
        <span class="token-saved-text"></span>
        <button type="button" class="btn btn-small btn-danger" data-act="forget">トークンを消す</button>
      </div>
      <p class="dialog-note">
        トークンは、この端末の中にだけ保存します。
        <a href="${TOKEN_PAGE}" target="_blank" rel="noopener">GitHubでトークンを作る</a>
      </p>
      <p class="sync-check" role="status"></p>
      <div class="dialog-actions">
        <button type="button" class="btn" data-act="test">接続を試す</button>
        <button type="button" class="btn btn-primary" data-act="save">保存して同期</button>
        <button type="submit" class="btn">閉じる</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector('form');
  const ownerInput = form.elements.owner;
  const repoInput = form.elements.repo;
  const tokenInput = form.elements.token;
  const savedBox = dialog.querySelector('.token-saved');
  const savedText = dialog.querySelector('.token-saved-text');
  const check = dialog.querySelector('.sync-check');
  let savedToken = '';

  // ---- ヘッダーの表示 ----

  async function showIdle() {
    const { lastSyncedAt } = store.getLocal('sync');
    if (lastSyncedAt) status.textContent = `最後に同期: ${formatDateTime(lastSyncedAt)}`;
    else status.textContent = (await isConfigured()) ? 'まだ同期していません' : '同期: 未設定';
    status.title = '';
  }

  // ---- 設定画面 ----

  async function showSavedToken() {
    savedToken = await store.getToken();
    savedBox.hidden = !savedToken;
    savedText.textContent = savedToken ? `保存済み: ••••${savedToken.slice(-4)}` : '';
    tokenInput.value = '';
    tokenInput.placeholder = savedToken ? '変えるときだけ入れてください' : 'github_pat_ で始まる文字';
  }

  async function open() {
    const { owner, repo } = store.getLocal('sync');
    ownerInput.value = owner;
    repoInput.value = repo;
    check.textContent = '';
    check.classList.remove('is-error');
    await showSavedToken();
    dialog.showModal();
    // 開いたとたんに、入れなくてよい欄でキーボードが出ないようにする
    (savedToken ? form.querySelector('button[type="submit"]') : tokenInput).focus();
  }

  function current() {
    return {
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      token: tokenInput.value.trim() || savedToken,
    };
  }

  function showCheck(message, isError) {
    check.textContent = message;
    check.classList.toggle('is-error', isError);
  }

  // 戻り値: つながったら true
  async function test() {
    const cfg = current();
    if (!cfg.owner || !cfg.repo) {
      showCheck('リポジトリの持ち主と名前を入れてください', true);
      return false;
    }
    if (!cfg.token) {
      showCheck('トークンを入れてください', true);
      return false;
    }
    showCheck('確かめています…', false);
    const problem = await testConnection(cfg);
    showCheck(problem || 'つながりました(プライベートで、書きこめます)', Boolean(problem));
    return !problem;
  }

  async function save() {
    const cfg = current();
    if (!(await test())) return;
    const old = store.getLocal('sync');
    // 同期先を変えたら、前の同期先の記録は使わない
    if (old.owner !== cfg.owner || old.repo !== cfg.repo) {
      store.resetSyncMeta();
      store.setLocal('sync', { owner: cfg.owner, repo: cfg.repo, lastSyncedAt: null });
    }
    await store.setToken(cfg.token);
    dialog.close();
    syncNow();
  }

  dialog.addEventListener('click', async (e) => {
    const act = e.target.closest('button[data-act]')?.dataset.act;
    if (act === 'test') test();
    if (act === 'save') save();
    if (act === 'forget' && confirm('この端末からトークンを消します。同期するには、また入れ直す必要があります。よろしいですか?')) {
      await store.setToken('');
      await showSavedToken();
      showCheck('トークンを消しました', false);
      showIdle();
    }
  });

  // ---- 同期 ----

  async function syncOrSetup() {
    if (await isConfigured()) syncNow();
    else open();
  }

  syncButton.addEventListener('click', syncOrSetup);
  settingsButton.addEventListener('click', open);

  store.on('sync', ({ state, auto, result, error }) => {
    syncButton.disabled = state === 'running';
    if (state === 'running') {
      status.textContent = '同期中…';
      return;
    }
    if (state === 'error') {
      const message = errorMessage(error);
      status.textContent = '同期できませんでした';
      status.title = message;
      // 自動の同期では、電波がないときなどは知らせない
      if (!auto || !['offline', 'other'].includes(error?.kind)) toast(message, LONG);
      return;
    }
    showIdle();
    if (state === 'done') report(result, auto);
  });

  function report(r, auto) {
    const parts = [];
    if (r.received) parts.push(`受け取った歌詞 ${r.received}曲`);
    if (r.removed) parts.push(`ほかの端末で削除された歌詞 ${r.removed}曲を削除`);
    if (r.sent && !auto) parts.push(`送った ${r.sent}件`);
    let message = parts.length ? `同期しました(${parts.join('・')})` : '同期しました(変更はありませんでした)';
    if (r.conflicts) {
      message = `ほかの端末と同じ歌詞を変えていたので、古いほうを「コピー」として残しました(${r.conflicts}曲)`;
    }
    if (r.later) message += '。一部は次の同期で送ります';
    const worthTelling = r.received || r.removed || r.conflicts;
    if (!auto || worthTelling) toast(message, r.conflicts ? LONG * 1.5 : LONG);
  }

  showIdle();

  return { open, syncOrSetup };
}
