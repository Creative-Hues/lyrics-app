// こねこね欄: 歌詞ごとの試し書きの場所。自動で保存する。

import * as store from '../store.js';
import { openInDeepL } from '../deepl.js';
import { copyText, toast } from './util.js';

const SAVE_DELAY = 500;

export function createScratchPanel(root, { getLyricId }) {
  root.innerHTML = `
    <textarea class="scratch-text" aria-label="こねこね欄"
              placeholder="試し書きの文を置いておく場所です。エディタの上の「こねこねへ送る」で、今の行をここに送れます。"></textarea>
    <div class="scratch-actions">
      <button type="button" class="btn btn-primary" data-act="deepl">DeepLで開く</button>
      <button type="button" class="btn" data-act="copy">コピー</button>
    </div>
    <p class="panel-note">DeepLで開くと、文はクリップボードにもコピーされます。</p>
  `;

  const text = root.querySelector('.scratch-text');
  let lyricId = null; // この欄が表示している歌詞
  let timer = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!lyricId || !store.getLyric(lyricId)) return;
    if (store.getLyric(lyricId).scratch !== text.value) {
      store.updateLyric(lyricId, { scratch: text.value });
    }
  }

  text.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
  });

  root.querySelector('[data-act="deepl"]').addEventListener('click', async () => {
    const value = text.value.trim();
    if (!value) {
      toast('こねこね欄に文がありません');
      return;
    }
    if (!(await openInDeepL(value))) toast('コピーできませんでした');
  });

  root.querySelector('[data-act="copy"]').addEventListener('click', () => {
    if (text.value.trim()) copyText(text.value);
  });

  return {
    flush,

    // 開いている歌詞が変わったとき
    refresh() {
      flush();
      this.reload();
    },

    // 同期で中身が入れ替わったとき(今の欄の文は保存しない)
    reload() {
      clearTimeout(timer);
      timer = null;
      lyricId = getLyricId();
      const lyric = store.getLyric(lyricId);
      text.disabled = !lyric;
      text.value = lyric ? lyric.scratch || '' : '';
    },

    // 文を最後に足す(前に文があれば改行してから)
    append(line) {
      if (!lyricId) return;
      const v = text.value.replace(/\s+$/, '');
      text.value = v ? `${v}\n${line}` : line;
      flush();
    },
  };
}
