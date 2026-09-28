// エディタ: タイトル・フォルダ・本文。
// 本文は普通の入力欄(textarea)。その後ろに同じ文字を並べた「下じきの層」を置き、
// 行の最後の単語に色をつける(textarea の中の文字には直接色をつけられないため)。
// textarea は中身に合わせて高さを伸ばし、外側の枠でスクロールする。

import * as store from '../store.js';
import { lastWordRange, pickWord } from '../lyric-text.js';
import { esc } from './util.js';
import { isMobile } from './viewport.js';

const SAVE_DELAY = 500; // 入力が止まってから保存するまでの時間(ミリ秒)

export function createEditor(root, { onWordPick, onNew }) {
  root.innerHTML = `
    <div class="editor-empty">
      <p>歌詞を選ぶか、新しく作ってください。</p>
      <button type="button" class="btn btn-primary" data-act="new">＋ 新しい歌詞</button>
    </div>
    <div class="editor-main" hidden>
      <div class="editor-meta">
        <input class="title-input" type="text" placeholder="タイトル" aria-label="タイトル">
        <label class="folder-pick">フォルダ <select aria-label="フォルダ"></select></label>
      </div>
      <div class="editor-scroll">
        <div class="editor-surface">
          <div class="editor-backdrop" aria-hidden="true"></div>
          <textarea class="editor-text" aria-label="歌詞"
                    placeholder="ここに歌詞を書きます。単語をダブルクリックすると、右に韻が出ます。"></textarea>
        </div>
      </div>
    </div>
  `;

  const empty = root.querySelector('.editor-empty');
  const main = root.querySelector('.editor-main');
  const titleInput = root.querySelector('.title-input');
  const folderSelect = root.querySelector('.folder-pick select');
  const scroller = root.querySelector('.editor-scroll');
  const surface = root.querySelector('.editor-surface');
  const backdrop = root.querySelector('.editor-backdrop');
  const text = root.querySelector('.editor-text');

  let currentId = null;
  let pending = null; // まだ保存していない変更
  let pendingTouch = false;
  let saveTimer = null;

  // ---- 保存 ----

  function scheduleSave(patch, touch) {
    if (!currentId) return;
    pending = { ...pending, ...patch };
    pendingTouch = pendingTouch || touch;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DELAY);
  }

  function flush() {
    clearTimeout(saveTimer);
    if (!pending || !currentId) return;
    store.updateLyric(currentId, pending, { touch: pendingTouch });
    pending = null;
    pendingTouch = false;
  }

  function saveCursor() {
    scheduleSave({ cursor: text.selectionStart }, false);
  }

  // ---- 表示 ----

  function renderBackdrop() {
    const html = text.value
      .split('\n')
      .map((line) => {
        const r = lastWordRange(line);
        if (!r) return esc(line);
        return esc(line.slice(0, r[0])) + `<mark>${esc(line.slice(r[0], r[1]))}</mark>` + esc(line.slice(r[1]));
      })
      .join('\n');
    // 末尾が改行のとき、最後の空の行も高さを持たせる
    backdrop.innerHTML = html + ' ';
  }

  // textarea の高さを中身に合わせる(枠より小さくはしない)
  function autosize() {
    const top = scroller.scrollTop;
    text.style.height = '0px';
    text.style.height = `${Math.max(text.scrollHeight, scroller.clientHeight)}px`;
    scroller.scrollTop = top;
  }

  function refresh() {
    renderBackdrop();
    autosize();
  }

  // カーソルの位置が枠の中ほどに見えるようにスクロールする
  function scrollToCursor() {
    const probe = backdrop.cloneNode(false);
    probe.style.visibility = 'hidden';
    probe.textContent = text.value.slice(0, text.selectionStart);
    const marker = document.createElement('span');
    marker.textContent = '|';
    probe.appendChild(marker);
    surface.appendChild(probe);
    scroller.scrollTop = marker.offsetTop - scroller.clientHeight / 2;
    probe.remove();
  }

  function renderFolderOptions(selected) {
    const names = [...store.getFolders(), store.UNFILED];
    folderSelect.innerHTML = names
      .map((n) => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${esc(n)}</option>`)
      .join('');
  }

  // ---- 文字を入れる ----

  // start〜end を str に置き換える。Ctrl+Z で戻せるよう、ブラウザの入力として行う。
  function insertText(str, start, end) {
    text.focus();
    text.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, str)) {
      text.setRangeText(str, start, end, 'end');
      text.dispatchEvent(new Event('input'));
    }
  }

  // ---- 操作 ----

  text.addEventListener('input', () => {
    refresh();
    scheduleSave({ body: text.value, cursor: text.selectionStart }, true);
  });
  for (const type of ['keyup', 'mouseup', 'blur']) {
    text.addEventListener(type, saveCursor);
  }
  let lastPointerType = 'mouse';
  text.addEventListener('pointerdown', (e) => (lastPointerType = e.pointerType));
  text.addEventListener('dblclick', () => {
    if (lastPointerType === 'touch') return; // タッチは下のダブルタップで扱う
    const word = pickWord(text.value, text.selectionStart, text.selectionEnd);
    if (word) onWordPick(word);
  });

  // スマホ: ダブルタップ(短い間に同じ所を2回タップ)で単語を調べる。
  // iPhoneは dblclick を出さないことがあるので、タップの間隔と位置から自分で見分ける。
  const DOUBLE_TAP_MS = 350;
  const DOUBLE_TAP_PX = 30;
  let lastTap = null;
  text.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const now = e.timeStamp;
    const isDouble =
      lastTap &&
      now - lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX;
    lastTap = isDouble ? null : { time: now, x: e.clientX, y: e.clientY };
    if (!isDouble) return;
    // ブラウザが単語を選び終わるのを少し待ってから読む
    setTimeout(() => {
      const word = pickWord(text.value, text.selectionStart, text.selectionEnd);
      if (word) onWordPick(word);
    }, 80);
  });

  titleInput.addEventListener('input', () => {
    scheduleSave({ title: titleInput.value }, true);
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      text.focus();
    }
  });

  folderSelect.addEventListener('change', () => {
    flush();
    store.updateLyric(currentId, { folder: folderSelect.value }, { touch: false });
  });

  root.querySelector('[data-act="new"]').addEventListener('click', onNew);

  // 画面の幅が変わると折り返しが変わるので、高さを合わせ直す
  new ResizeObserver(() => {
    if (currentId) autosize();
  }).observe(scroller);

  store.on('folders', () => {
    if (currentId) renderFolderOptions(store.getLyric(currentId).folder);
  });

  return {
    get currentId() {
      return currentId;
    },

    open(lyric) {
      flush();
      currentId = lyric.id;
      empty.hidden = true;
      main.hidden = false;
      titleInput.value = lyric.title;
      renderFolderOptions(lyric.folder);
      text.value = lyric.body;
      refresh();
      const pos = Math.min(lyric.cursor || 0, text.value.length);
      // スマホでは、開いただけでキーボードが出ないよう、入力欄に入らない(位置だけ戻す)
      if (!isMobile()) text.focus({ preventScroll: true });
      text.setSelectionRange(pos, pos);
      scrollToCursor();
    },

    // 同期で中身が入れ替わったとき: カーソルとスクロールの位置はそのままで、表示だけ新しくする
    reload(lyric) {
      if (lyric.id !== currentId) return;
      titleInput.value = lyric.title;
      renderFolderOptions(lyric.folder);
      if (text.value === lyric.body) return;
      const { selectionStart: s, selectionEnd: e } = text;
      const top = scroller.scrollTop;
      text.value = lyric.body;
      const n = text.value.length;
      text.setSelectionRange(Math.min(s, n), Math.min(e, n));
      refresh();
      scroller.scrollTop = top;
    },

    close() {
      clearTimeout(saveTimer);
      pending = null;
      currentId = null;
      main.hidden = true;
      empty.hidden = false;
    },

    flush,

    focusTitle() {
      titleInput.focus();
      titleInput.select();
    },

    // 単語をカーソル位置に入れる。前後の単語とくっつかないよう、必要なら空白を足す
    insertWord(word) {
      if (!currentId) return;
      const { selectionStart: s, selectionEnd: e, value: v } = text;
      const before = v[s - 1];
      const after = v[e];
      const spaceBefore = before !== undefined && !/\s/.test(before) ? ' ' : '';
      const spaceAfter = after !== undefined && !/[\s,.!?;:)\]]/.test(after) ? ' ' : '';
      insertText(spaceBefore + word + spaceAfter, s, e);
    },

    getText() {
      return currentId ? text.value : '';
    },

    // カーソルのある単語(選んでいれば、その範囲に重なる単語)
    getWordAtCursor() {
      if (!currentId) return null;
      return pickWord(text.value, text.selectionStart, text.selectionEnd);
    },

    // 送る・調べる範囲: 選んでいればその部分、選んでいなければカーソルのある行
    getTargetRange() {
      const { selectionStart: s, selectionEnd: e, value: v } = text;
      if (s !== e) return { start: s, end: e };
      const start = v.lastIndexOf('\n', s - 1) + 1;
      let end = v.indexOf('\n', s);
      if (end < 0) end = v.length;
      return { start, end };
    },

    // DeepL・こねこね欄・AIに聞く に送る文
    getSendText() {
      if (!currentId) return '';
      const { start, end } = this.getTargetRange();
      return text.value.slice(start, end).trim();
    },

    // start〜end を str に置き換える(Ctrl+Z で戻せる)
    replaceRange(start, end, str) {
      if (!currentId) return;
      insertText(str, start, end);
    },

    // start〜end を選んだ状態にして、見える位置までスクロールする
    revealRange(start, end) {
      if (!currentId) return;
      text.focus({ preventScroll: true });
      text.setSelectionRange(start, end);
      scrollToCursor();
    },

    // タグは新しい行として入れる。カーソルが空の行にあるときは、その行に入れる
    insertTag(tag) {
      if (!currentId) return;
      const v = text.value;
      const pos = text.selectionStart;
      const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
      let lineEnd = v.indexOf('\n', pos);
      if (lineEnd < 0) lineEnd = v.length;
      if (v.slice(lineStart, lineEnd).trim() === '') {
        insertText(tag, lineStart, lineEnd);
      } else {
        insertText('\n' + tag, lineEnd, lineEnd);
      }
    },
  };
}
