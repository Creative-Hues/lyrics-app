// 辞書パネル: 単語の意味をすべて出す。入力欄で自由に調べられる。
// 日本語が打たれたときは、アプリ内の辞書では引かず、Weblio(和英)へのリンクを出す。

import { lookup, senses, hasJapanese } from '../dict.js';
import { esc } from './util.js';

const INPUT_DELAY = 250; // 打つのが止まってから調べるまでの時間(ミリ秒)

export function weblioUrl(word) {
  return `https://ejje.weblio.jp/content/${encodeURIComponent(word.trim())}`;
}

function weblioLink(word, label) {
  return `<a class="btn btn-small ext-link" href="${esc(weblioUrl(word))}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

// 「cryの過去・過去分詞」「footの複数形」「『good』の最上級」のような、元の形を示す1語
const BASE_REF = /(?<![A-Za-z])(『?)([A-Za-z][A-Za-z-]*)(』?)(\s?の(?:過去|現在分詞|複数形|比較級|最上級|三人称))/g;

// 元の形は押して引けるようにし、『』(主な意味の印)は太字にする
function renderSense(s) {
  return esc(s)
    .replace(BASE_REF, '$1<button type="button" class="dict-ref" data-word="$2">$2</button>$3$4')
    .replace(/『([^』]*)』/g, '<strong>$1</strong>');
}

export function createDictionaryPanel(root) {
  root.innerHTML = `
    <input type="search" class="dict-input" placeholder="単語を調べる" aria-label="調べる単語"
           autocomplete="off" autocapitalize="off" spellcheck="false">
    <div class="dict-result" role="status"></div>
    <p class="panel-note">
      辞書: <a href="https://github.com/kujirahand/EJDict" target="_blank" rel="noopener">EJDict-hand</a>(パブリックドメイン)
    </p>
  `;

  const input = root.querySelector('.dict-input');
  const result = root.querySelector('.dict-result');
  let requestNo = 0;
  let timer = null;

  async function search(raw) {
    const word = raw.trim();
    const no = ++requestNo;
    if (!word) {
      result.innerHTML = `<p class="empty-note">エディタの単語をダブルクリックするか、ここに打つと意味が出ます。</p>`;
      return;
    }
    if (hasJapanese(word)) {
      result.innerHTML = `
        <p class="empty-note">アプリ内の辞書は、英語の単語だけ引けます。</p>
        ${weblioLink(word, 'Weblioで調べる')}`;
      return;
    }

    let found;
    try {
      found = await lookup(word);
    } catch (err) {
      console.error(err);
      if (no !== requestNo) return;
      result.innerHTML = `
        <p class="empty-note">${navigator.onLine ? '辞書を読み込めませんでした' : 'オフラインのため辞書を読み込めませんでした'}</p>
        ${weblioLink(word, '詳しく(Weblio)')}`;
      return;
    }
    if (no !== requestNo) return;

    if (!found) {
      result.innerHTML = `
        <p class="empty-note">「${esc(word)}」は辞書に見つかりませんでした</p>
        ${weblioLink(word, '詳しく(Weblio)')}`;
      return;
    }

    const changed = found.head !== found.query;
    result.innerHTML = `
      <div class="dict-head">
        <span class="dict-word">${esc(changed ? found.query : found.entries[0].head)}</span>
        ${changed ? `<span class="dict-base">→ ${esc(found.head)}</span>` : ''}
        ${weblioLink(found.head, '詳しく(Weblio)')}
      </div>
      ${found.entries
        .map(
          (e) => `
          <div class="dict-entry">
            ${found.entries.length > 1 ? `<div class="dict-entry-head">${esc(e.head)}</div>` : ''}
            <ol class="dict-senses">${senses(e.meaning).map((s) => `<li>${renderSense(s)}</li>`).join('')}</ol>
          </div>`,
        )
        .join('')}
    `;
  }

  // 元の形を押すと、その単語の意味に移る
  result.addEventListener('click', (e) => {
    const ref = e.target.closest('.dict-ref');
    if (!ref) return;
    clearTimeout(timer);
    input.value = ref.dataset.word;
    search(ref.dataset.word);
  });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), INPUT_DELAY);
  });

  search('');

  return {
    // エディタで選んだ単語を調べる
    show(word) {
      clearTimeout(timer);
      input.value = word;
      search(word);
    },
  };
}
