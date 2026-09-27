// 歌詞一覧: フォルダの切り替え・管理と、歌詞の一覧。

import * as store from '../store.js';
import { esc, copyText, formatDate } from './util.js';
import { enableReorder } from './list-reorder.js';

export function createLyricList(root, { onOpen, onNew }) {
  root.innerHTML = `
    <div class="list-section">
      <h2 class="pane-heading">フォルダ</h2>
      <ul class="folder-list"></ul>
      <div class="folder-actions">
        <button type="button" class="btn" data-act="add-folder">＋ フォルダ</button>
        <button type="button" class="btn" data-act="rename-folder">名前を変える</button>
        <button type="button" class="btn" data-act="delete-folder">消す</button>
      </div>
    </div>
    <div class="list-section list-section--grow">
      <div class="list-head">
        <h2 class="pane-heading">歌詞</h2>
        <button type="button" class="btn btn-primary" data-act="new">＋ 新しい歌詞</button>
      </div>
      <ul class="lyric-list"></ul>
    </div>
  `;

  const folderList = root.querySelector('.folder-list');
  const lyricList = root.querySelector('.lyric-list');
  const renameBtn = root.querySelector('[data-act="rename-folder"]');
  const deleteBtn = root.querySelector('[data-act="delete-folder"]');
  let activeId = null;

  function renderFolders() {
    const view = store.getLocal('view');
    const names = [store.ALL, ...store.getFolders(), store.UNFILED];
    folderList.innerHTML = names
      .map(
        (name) => `
        <li>
          <button type="button" class="folder-item ${name === view ? 'is-active' : ''}"
                  data-folder="${esc(name)}" aria-pressed="${name === view}">${esc(name)}</button>
        </li>`,
      )
      .join('');
    // 「すべて」「未分類」は名前を変えたり消したりできない
    const editable = view !== store.ALL && view !== store.UNFILED;
    renameBtn.disabled = !editable;
    deleteBtn.disabled = !editable;
  }

  function renderLyrics() {
    if (reorder.isDragging()) return; // ドラッグ中は描き直さない(終わったら描き直される)
    const view = store.getLocal('view');
    const items = store.listLyrics(view);
    if (items.length === 0) {
      lyricList.innerHTML = `<li class="empty-note">まだ歌詞がありません</li>`;
      return;
    }
    lyricList.innerHTML = items
      .map(
        (l) => `
        <li class="lyric-item ${l.id === activeId ? 'is-active' : ''}" data-id="${esc(l.id)}" title="ドラッグで並べ替え">
          <button type="button" class="lyric-open" data-act="open">
            <span class="lyric-title">${esc(l.title || '無題')}</span>
            <span class="lyric-meta">
              ${formatDate(l.updatedAt)}${view === store.ALL ? ` ・ ${esc(l.folder)}` : ''}
            </span>
          </button>
          <div class="lyric-actions">
            <button type="button" class="btn btn-small" data-act="copy">コピー</button>
            <button type="button" class="btn btn-small btn-danger" data-act="delete">削除</button>
          </div>
        </li>`,
      )
      .join('');
  }

  function render() {
    renderFolders();
    renderLyrics();
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.folder) {
      store.setLocal('view', btn.dataset.folder);
      render();
      return;
    }

    const view = store.getLocal('view');
    const id = btn.closest('.lyric-item')?.dataset.id;

    switch (btn.dataset.act) {
      case 'new':
        onNew();
        break;
      case 'open':
        onOpen(id);
        break;
      case 'copy':
        copyText(store.getLyric(id).body, '歌詞をコピーしました');
        break;
      case 'delete': {
        const title = store.getLyric(id).title || '無題';
        if (confirm(`「${title}」を削除します。元に戻せません。よろしいですか?`)) {
          store.deleteLyric(id);
        }
        break;
      }
      case 'add-folder': {
        const name = prompt('新しいフォルダの名前');
        if (name === null) break;
        const problem = store.addFolder(name);
        if (problem) alert(problem);
        break;
      }
      case 'rename-folder': {
        const name = prompt('新しい名前', view);
        if (name === null) break;
        const problem = store.renameFolder(view, name);
        if (problem) alert(problem);
        break;
      }
      case 'delete-folder':
        if (confirm(`フォルダ「${view}」を消します。中の歌詞は「${store.UNFILED}」に移ります。よろしいですか?`)) {
          store.deleteFolder(view);
        }
        break;
    }
  });

  const reorder = enableReorder(lyricList, {
    itemSelector: '.lyric-item',
    scroller: root,
    onDrop: (items) => store.reorderLyrics(items.map((el) => el.dataset.id)),
  });

  store.on('lyrics', renderLyrics);
  store.on('folders', render);
  render();

  return {
    setActive(id) {
      activeId = id;
      renderLyrics();
    },
  };
}
