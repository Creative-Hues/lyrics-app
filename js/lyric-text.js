// 歌詞の文字を扱う決まり(画面に依存しない)。

// 英単語: 「don't」「rock'n'roll」のようなアポストロフィ入りも1語として扱う。
// 「runnin'」のような、ing の g を省いた形は、最後の ' まで1語にする
const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:(?<=in)['’])?/g;

// タグの行: 行全体が (Verse) や [Chorus] のように括弧で囲まれている
export function isTagLine(line) {
  return /^\s*(\([^()]*\)|\[[^[\]]*\])\s*$/.test(line);
}

// 行の最後の英単語の位置 [開始, 終了]。目立たせる対象でなければ null。
// 句読点は無視する。タグの行と空の行は対象外。
export function lastWordRange(line) {
  if (line.trim() === '' || isTagLine(line)) return null;
  let last = null;
  for (const m of line.matchAll(WORD)) last = m;
  return last ? [last.index, last.index + last[0].length] : null;
}

// ダブルクリックで選ばれた範囲から、英単語を1つ取り出す(前後の空白や句読点を除く)
// 文法チェックに送る文を作る。body の start〜end から、タグの行を外す。
// 戻り値の toOriginal(位置) で、送った文の中の位置を body の中の位置に戻せる。
export function prepareForCheck(body, start, end) {
  const segments = []; // { sent: 送った文の中の位置, orig: body の中の位置, len }
  const kept = [];
  let sentPos = 0;
  let origPos = start;
  for (const line of body.slice(start, end).split('\n')) {
    if (!isTagLine(line)) {
      segments.push({ sent: sentPos, orig: origPos, len: line.length });
      kept.push(line);
      sentPos += line.length + 1;
    }
    origPos += line.length + 1;
  }
  return {
    text: kept.join('\n'),
    toOriginal(offset) {
      for (const s of segments) {
        if (offset >= s.sent && offset <= s.sent + s.len) return s.orig + (offset - s.sent);
      }
      return -1;
    },
  };
}

// ブラウザの選択は「runnin'」の ' を含まないことがあるので、選ばれた範囲に重なる単語を丸ごと返す。
export function pickWord(text, start, end) {
  for (const m of text.matchAll(WORD)) {
    const s = m.index;
    const e = s + m[0].length;
    // 選んでいればその範囲に重なる単語、何も選んでいなければカーソルのある単語
    const hit = end > start ? s < end && e > start : s <= start && start <= e;
    if (hit) return m[0];
  }
  return null;
}
