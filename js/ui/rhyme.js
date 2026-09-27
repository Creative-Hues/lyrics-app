// 韻検索パネル: 選んだ単語の韻を、音節数つきで上位10個出す。
// 一覧の単語を押すと、開いている歌詞の単語メモに追加する。

import * as store from '../store.js';
import { findRhymes } from '../api/datamuse.js';
import { lookup, shortMeaning } from '../dict.js';
import { esc, toast } from './util.js';

export function createRhymePanel(root, { getLyricId, onShowDictionary }) {
  root.innerHTML = `
    <div class="rhyme-head">
      <p class="rhyme-word">エディタの単語をダブルクリックすると、ここに韻が出ます。</p>
      <button type="button" class="rhyme-meaning" title="辞書タブで見る" hidden></button>
      <div class="segmented" role="group" aria-label="韻の種類">
        <button type="button" class="segmented-btn" data-mode="perfect">完全な韻</button>
        <button type="button" class="segmented-btn" data-mode="near">近い韻</button>
      </div>
    </div>
    <p class="rhyme-status" role="status"></p>
    <ul class="rhyme-list"></ul>
    <p class="panel-note">数字は音節数(音のまとまりの数)。単語を押すと単語メモに追加します。<br>
      データ: <a href="https://www.datamuse.com/api/" target="_blank" rel="noopener">Datamuse</a></p>
  `;

  const wordEl = root.querySelector('.rhyme-word');
  const statusEl = root.querySelector('.rhyme-status');
  const meaningEl = root.querySelector('.rhyme-meaning');
  const listEl = root.querySelector('.rhyme-list');

  let mode = 'perfect';
  let word = null;
  let results = [];
  let requestNo = 0; // 古い問い合わせの答えで上書きしないための番号
  const cache = new Map();

  function renderMode() {
    for (const btn of root.querySelectorAll('.segmented-btn')) {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  function renderResults() {
    const lyric = store.getLyric(getLyricId());
    const memo = new Set((lyric?.memo || []).map((m) => m.toLowerCase()));
    listEl.innerHTML = results
      .map((r) => {
        const inMemo = memo.has(r.word.toLowerCase());
        return `
        <li>
          <button type="button" class="rhyme-item ${inMemo ? 'is-in-memo' : ''}" data-word="${esc(r.word)}">
            <span class="rhyme-item-word">${esc(r.word)}</span>
            <span class="rhyme-item-syl">${r.syllables ?? '-'}</span>
            ${inMemo ? '<span class="rhyme-item-check" aria-label="メモにあります">✓</span>' : ''}
          </button>
        </li>`;
      })
      .join('');
  }

  // 韻の一覧の上に、短い意味を1行で出す
  async function showMeaning(w) {
    meaningEl.hidden = true;
    let found = null;
    try {
      found = await lookup(w);
    } catch (err) {
      console.error(err);
    }
    if (w !== word) return;
    meaningEl.textContent = found ? shortMeaning(found.entries[0].meaning) : '辞書に見つかりませんでした';
    meaningEl.hidden = false;
  }

  async function search() {
    if (!word) return;
    const no = ++requestNo;
    // 「runnin'」のような形は Datamuse が知らないので、「running」で調べる
    const query = word.replace(/in['’]$/i, 'ing');
    const key = `${mode}:${query.toLowerCase()}`;
    wordEl.innerHTML =
      `<strong>${esc(word)}</strong> の韻` + (query !== word ? `(${esc(query)} で調べています)` : '');
    results = [];
    renderResults();

    if (cache.has(key)) {
      results = cache.get(key);
    } else if (!navigator.onLine) {
      statusEl.textContent = 'オフラインのため韻を調べられません';
      return;
    } else {
      statusEl.textContent = '調べています…';
      try {
        const found = await findRhymes(query, mode);
        cache.set(key, found);
        if (no !== requestNo) return;
        results = found;
      } catch (err) {
        if (no !== requestNo) return;
        console.error(err);
        statusEl.textContent = navigator.onLine
          ? '韻を調べられませんでした。少し待ってからもう一度試してください'
          : 'オフラインのため韻を調べられません';
        return;
      }
    }
    statusEl.textContent = results.length ? '' : '韻が見つかりませんでした';
    renderResults();
  }

  meaningEl.addEventListener('click', onShowDictionary);

  root.querySelector('.segmented').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    renderMode();
    search();
  });

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-word]');
    if (!btn) return;
    const id = getLyricId();
    if (!id) {
      toast('歌詞を開くと、単語メモに追加できます');
      return;
    }
    const w = btn.dataset.word;
    toast(store.addMemo(id, w) ? `単語メモに追加: ${w}` : `「${w}」はもうメモにあります`);
  });

  store.on('memo', renderResults);
  renderMode();

  return {
    search(newWord) {
      word = newWord;
      showMeaning(newWord);
      search();
    },
    // 開いている歌詞が変わったとき(メモの✓を付け直す)
    refresh: renderResults,
  };
}
