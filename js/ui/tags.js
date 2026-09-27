// タグ挿入ボタンの列と、タグの編集(追加・並べ替え・削除)。
// mirrors: 同じタグボタンを並べる場所をほかにも持てる(スマホのキーボードの上のバー)。

import * as store from '../store.js';
import { esc } from './util.js';

export function createTagBar(root, dialog, { onInsert, mirrors = [] }) {
  root.innerHTML = `
    <div class="tag-buttons"></div>
    <button type="button" class="btn btn-small" data-act="edit">タグを編集</button>
  `;
  dialog.innerHTML = `
    <form method="dialog" class="tag-dialog">
      <h2 class="dialog-title">タグを編集</h2>
      <ul class="tag-edit-list"></ul>
      <div class="tag-add">
        <input type="text" class="tag-add-input" placeholder="例: (Hook)" aria-label="追加するタグ">
        <button type="button" class="btn" data-act="add">追加</button>
      </div>
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary">閉じる</button>
      </div>
    </form>
  `;

  const containers = [root.querySelector('.tag-buttons'), ...mirrors];
  const editList = dialog.querySelector('.tag-edit-list');
  const addInput = dialog.querySelector('.tag-add-input');

  function render() {
    const tags = store.getTags();
    const html = tags
      .map((t) => `<button type="button" class="btn tag-btn" data-tag="${esc(t)}">${esc(t)}</button>`)
      .join('');
    for (const c of containers) c.innerHTML = html;
    editList.innerHTML = tags
      .map(
        (t, i) => `
        <li class="tag-edit-item" data-index="${i}">
          <span class="tag-edit-name">${esc(t)}</span>
          <button type="button" class="btn btn-small" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
          <button type="button" class="btn btn-small" data-act="down" ${i === tags.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
          <button type="button" class="btn btn-small btn-danger" data-act="remove" aria-label="消す">×</button>
        </li>`,
      )
      .join('');
  }

  function addTag() {
    const tag = addInput.value.trim();
    if (!tag) return;
    const tags = store.getTags();
    if (tags.includes(tag)) {
      alert(`「${tag}」はもうあります`);
      return;
    }
    store.setTags([...tags, tag]);
    addInput.value = '';
    addInput.focus();
  }

  // タグボタンを押しても、エディタのカーソルが外れないようにする
  for (const c of containers) {
    c.addEventListener('mousedown', (e) => e.preventDefault());
    c.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tag]');
      if (btn) onInsert(btn.dataset.tag);
    });
  }

  root.querySelector('[data-act="edit"]').addEventListener('click', () => dialog.showModal());

  dialog.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'add') {
      addTag();
      return;
    }
    const tags = store.getTags();
    const i = Number(btn.closest('.tag-edit-item').dataset.index);
    if (btn.dataset.act === 'up') [tags[i - 1], tags[i]] = [tags[i], tags[i - 1]];
    if (btn.dataset.act === 'down') [tags[i + 1], tags[i]] = [tags[i], tags[i + 1]];
    if (btn.dataset.act === 'remove') tags.splice(i, 1);
    store.setTags(tags);
  });

  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  });

  store.on('tags', render);
  render();

  return {
    openEditor: () => dialog.showModal(),
  };
}
