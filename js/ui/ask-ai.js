// 「AIに聞く」ボタン: 質問を選ぶと、選んだ行と質問をまとめてコピーする(Claudeに貼って使う)。
// アプリからAIのAPIは呼ばない。

import * as store from '../store.js';
import { esc, copyText, toast } from './util.js';

// 質問(prompts の index 番目)と、選んだ行をまとめてコピーする
export function askAi(editor, index) {
  if (!editor.getSendText()) {
    toast(editor.currentId ? '聞きたい行にカーソルを置くか、文を選んでください' : '歌詞を開いてください');
    return;
  }
  const prompt = store.getAiPrompts()[index];
  const text = prompt.template
    .replaceAll('{selection}', editor.getSendText())
    .replaceAll('{lyrics}', editor.getText().trim());
  copyText(text, '質問をコピーしました。Claudeに貼ってください');
}

export function createAskAi(button, menu, { editor }) {
  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function open() {
    const prompts = store.getAiPrompts();
    menu.innerHTML = prompts
      .map((p, i) => `<button type="button" class="menu-item" role="menuitem" data-prompt="${i}">${esc(p.label)}</button>`)
      .join('');
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('.menu-item')?.focus();
  }

  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');

  // メニューを開いても、エディタの選択が外れないようにする
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', () => {
    if (!menu.hidden) {
      close();
      return;
    }
    if (!editor.getSendText()) {
      toast(editor.currentId ? '聞きたい行にカーソルを置くか、文を選んでください' : '歌詞を開いてください');
      return;
    }
    open();
  });

  menu.addEventListener('mousedown', (e) => e.preventDefault());
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-prompt]');
    if (!item) return;
    close();
    askAi(editor, Number(item.dataset.prompt));
  });

  // メニューの外を押したとき・Esc で閉じる
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      close();
      button.focus();
    }
  });
}
