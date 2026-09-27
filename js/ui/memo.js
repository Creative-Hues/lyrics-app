// 単語メモパネル: 歌詞ごとの単語置き場。
// 単語を押すとエディタのカーソル位置に入れる。×で消す。

import * as store from '../store.js';
import { esc, toast } from './util.js';

export function createMemoPanel(root, { getLyricId, onInsert }) {
  root.innerHTML = `
    <div class="memo-add">
      <input type="text" class="memo-input" placeholder="単語を追加" aria-label="単語メモに追加する単語">
      <button type="button" class="btn" data-act="add">追加</button>
    </div>
    <ul class="memo-list"></ul>
    <p class="panel-note">単語を押すと、エディタのカーソル位置に入ります。</p>
  `;

  const input = root.querySelector('.memo-input');
  const listEl = root.querySelector('.memo-list');

  function render() {
    const lyric = store.getLyric(getLyricId());
    if (!lyric) {
      listEl.innerHTML = `<li class="empty-note">歌詞を開くと使えます</li>`;
      return;
    }
    if (lyric.memo.length === 0) {
      listEl.innerHTML = `<li class="empty-note">韻の一覧の単語を押すと、ここに追加されます</li>`;
      return;
    }
    listEl.innerHTML = lyric.memo
      .map(
        (w, i) => `
        <li class="memo-chip">
          <button type="button" class="memo-word" data-index="${i}">${esc(w)}</button>
          <button type="button" class="memo-remove" data-remove="${i}" aria-label="${esc(w)} を消す">×</button>
        </li>`,
      )
      .join('');
  }

  function add() {
    const id = getLyricId();
    const w = input.value.trim();
    if (!id || !w) return;
    if (!store.addMemo(id, w)) toast(`「${w}」はもうメモにあります`);
    input.value = '';
    input.focus();
  }

  // 単語を押しても、エディタのカーソルが外れないようにする
  listEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('.memo-word')) e.preventDefault();
  });
  listEl.addEventListener('click', (e) => {
    const id = getLyricId();
    const wordBtn = e.target.closest('[data-index]');
    const removeBtn = e.target.closest('[data-remove]');
    if (wordBtn) onInsert(store.getLyric(id).memo[Number(wordBtn.dataset.index)]);
    if (removeBtn) store.removeMemo(id, Number(removeBtn.dataset.remove));
  });

  root.querySelector('[data-act="add"]').addEventListener('click', add);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });

  store.on('memo', render);
  render();

  return { refresh: render };
}
