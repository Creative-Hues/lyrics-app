// 文法パネル: ボタンを押したときだけ LanguageTool で調べ、指摘を「参考」として出す。
// 指摘は1個ずつ無視できる(その曲では次に調べたときも出さない)。
// 直し方の候補を押すと、エディタのその箇所を置き換える。

import * as store from '../store.js';
import { checkGrammar, MAX_CHARS, RateLimitError } from '../api/languagetool.js';
import { prepareForCheck } from '../lyric-text.js';
import { esc, toast } from './util.js';

const MAX_FIXES = 5; // 直し方の候補は最大5個まで出す

export function createGrammarPanel(root, { editor }) {
  root.innerHTML = `
    <div class="grammar-about">
      文法チェック: <a href="https://languagetool.org" target="_blank" rel="noopener">LanguageTool</a><br>
      <span>ボタンを押したときだけ、文がLanguageToolに送られます。</span>
    </div>
    <div class="grammar-actions">
      <button type="button" class="btn btn-primary" data-act="check-part">選んだ所を調べる</button>
      <button type="button" class="btn" data-act="check-all">全体を調べる</button>
    </div>
    <p class="grammar-status" role="status"></p>
    <ul class="grammar-list"></ul>
    <p class="panel-note">指摘は参考です。歌詞としてわざと崩している所は「無視」してください。</p>
  `;

  const statusEl = root.querySelector('.grammar-status');
  const listEl = root.querySelector('.grammar-list');
  const buttons = root.querySelectorAll('.grammar-actions button');

  let lyricId = null; // 調べた歌詞
  let issues = []; // { rule, message, start, end, text, fixes }
  let hiddenCount = 0; // 無視したので出さなかった数
  let busy = false;

  function setBusy(on) {
    busy = on;
    for (const b of buttons) b.disabled = on;
  }

  function renderStatus() {
    const note = hiddenCount ? `(無視した指摘 ${hiddenCount}件は出していません)` : '';
    statusEl.textContent = issues.length ? `指摘が${issues.length}件あります${note}` : `指摘はありません${note}`;
  }

  function render() {
    const body = editor.getText();
    listEl.innerHTML = issues
      .map((it, i) => {
        // 問題の箇所を、その行の文と一緒に出す
        const lineStart = body.lastIndexOf('\n', it.start - 1) + 1;
        let lineEnd = body.indexOf('\n', it.end);
        if (lineEnd < 0) lineEnd = body.length;
        const context =
          esc(body.slice(lineStart, it.start)) +
          `<mark>${esc(it.text) || '&nbsp;'}</mark>` +
          esc(body.slice(it.end, lineEnd));
        const fixes = it.fixes
          .map(
            (f, j) =>
              `<button type="button" class="btn btn-small grammar-fix" data-fix="${i}:${j}">${f === '' ? '(削除)' : esc(f)}</button>`,
          )
          .join('');
        return `
        <li class="grammar-card">
          <button type="button" class="grammar-context" data-show="${i}" title="エディタでこの箇所を見る">${context}</button>
          <p class="grammar-message">${esc(it.message)}</p>
          ${fixes ? `<div class="grammar-fixes">${fixes}</div>` : ''}
          <div class="grammar-card-foot">
            <span class="grammar-rule">${esc(it.rule)}</span>
            <button type="button" class="btn btn-small" data-ignore="${i}">無視</button>
          </div>
        </li>`;
      })
      .join('');
  }

  function clear(message = '') {
    issues = [];
    hiddenCount = 0;
    statusEl.textContent = message;
    listEl.innerHTML = '';
  }

  async function check(whole) {
    const id = editor.currentId;
    if (!id) {
      toast('歌詞を開いてください');
      return;
    }
    if (busy) return;
    const body = editor.getText();
    const range = whole ? { start: 0, end: body.length } : editor.getTargetRange();
    const prepared = prepareForCheck(body, range.start, range.end);
    if (!prepared.text.trim()) {
      clear('調べる文がありません');
      return;
    }
    if (prepared.text.length > MAX_CHARS) {
      clear(`長すぎるため調べられません(1回${MAX_CHARS.toLocaleString()}文字まで)`);
      return;
    }
    if (!navigator.onLine) {
      clear('オフラインのため調べられません');
      return;
    }

    setBusy(true);
    clear('調べています…');
    try {
      const matches = await checkGrammar(prepared.text);
      if (editor.currentId !== id) return; // 調べている間に別の歌詞を開いた
      lyricId = id;
      const found = [];
      for (const m of matches) {
        const start = prepared.toOriginal(m.offset);
        const end = prepared.toOriginal(m.offset + m.length);
        if (start < 0 || end < 0) continue;
        const text = body.slice(start, end);
        if (store.isGrammarIgnored(id, m.rule.id, text)) {
          hiddenCount++;
          continue;
        }
        found.push({
          rule: m.rule.id,
          message: m.message,
          start,
          end,
          text,
          fixes: m.replacements.slice(0, MAX_FIXES).map((r) => r.value),
        });
      }
      issues = found;
      renderStatus();
      render();
    } catch (err) {
      console.error(err);
      if (err instanceof RateLimitError) {
        clear('短い時間に調べすぎました。1分ほど待ってから、もう一度試してください');
      } else if (!navigator.onLine) {
        clear('オフラインのため調べられません');
      } else {
        clear('調べられませんでした。少し待ってから、もう一度試してください');
      }
    } finally {
      setBusy(false);
    }
  }

  // 指摘の箇所が、調べたときの文字のままか
  function stillSame(it) {
    return editor.currentId === lyricId && editor.getText().slice(it.start, it.end) === it.text;
  }

  function applyFix(i, j) {
    const it = issues[i];
    if (!stillSame(it)) {
      toast('文が変わっているため置き換えられません。もう一度調べてください');
      return;
    }
    const fix = it.fixes[j];
    editor.replaceRange(it.start, it.end, fix);
    // 後ろにある指摘の位置を、文字数の増減の分だけずらす
    const delta = fix.length - (it.end - it.start);
    issues.splice(i, 1);
    for (const other of issues) {
      if (other.start >= it.end) {
        other.start += delta;
        other.end += delta;
      }
    }
    renderStatus();
    render();
  }

  root.querySelector('[data-act="check-part"]').addEventListener('click', () => check(false));
  root.querySelector('[data-act="check-all"]').addEventListener('click', () => check(true));

  // 候補を押してもエディタの選択が外れないようにする
  listEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-fix]')) e.preventDefault();
  });

  listEl.addEventListener('click', (e) => {
    const fixBtn = e.target.closest('[data-fix]');
    const showBtn = e.target.closest('[data-show]');
    const ignoreBtn = e.target.closest('[data-ignore]');
    if (fixBtn) {
      const [i, j] = fixBtn.dataset.fix.split(':').map(Number);
      applyFix(i, j);
    } else if (showBtn) {
      const it = issues[Number(showBtn.dataset.show)];
      if (stillSame(it)) editor.revealRange(it.start, it.end);
      else toast('文が変わっています。もう一度調べてください');
    } else if (ignoreBtn) {
      const i = Number(ignoreBtn.dataset.ignore);
      const it = issues[i];
      store.addGrammarIgnore(lyricId, it.rule, it.text);
      issues.splice(i, 1);
      hiddenCount++;
      renderStatus();
      render();
    }
  });

  return {
    // 開いている歌詞が変わったときは、前の結果を消す
    refresh() {
      if (editor.currentId !== lyricId) {
        lyricId = null;
        clear();
      }
    },
  };
}
