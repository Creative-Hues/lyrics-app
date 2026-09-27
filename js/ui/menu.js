// ボタンを押すと開く、小さなメニュー。
// getItems() は [{ label, action }] を返す。label が null の項目は区切り線になる。

import { esc } from './util.js';

export function createMenu(button, menu, { getItems }) {
  let items = [];

  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function open() {
    items = getItems();
    menu.innerHTML = items
      .map((it, i) =>
        it.label === null
          ? '<div class="menu-sep" role="separator"></div>'
          : `<button type="button" class="menu-item" role="menuitem" data-item="${i}">${esc(it.label)}</button>`,
      )
      .join('');
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  // メニューを開いても、エディタの選択が外れないようにする
  button.addEventListener('mousedown', (e) => e.preventDefault());
  menu.addEventListener('mousedown', (e) => e.preventDefault());

  button.addEventListener('click', () => (menu.hidden ? open() : close()));
  menu.addEventListener('click', (e) => {
    const el = e.target.closest('[data-item]');
    if (!el) return;
    close();
    items[Number(el.dataset.item)].action();
  });

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });

  return { close };
}
