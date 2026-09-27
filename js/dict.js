// 英和辞書(EJDict-hand)の読み込みと検索。画面に依存しない。
// 辞書は頭文字ごとのファイル(dict/a.txt 〜 z.txt)。調べる単語の頭文字のファイルだけを、そのとき読み込む。

const DICT_BASE = new URL('../dict/', import.meta.url);

const letters = new Map(); // 頭文字 → Promise<Map<小文字の見出し, [{ head, meaning }]>>

function parse(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const meaning = line.slice(tab + 1).trim();
    // 「color,colour」のように、つづり違いはカンマで並んでいる
    for (const rawHead of line.slice(0, tab).split(',')) {
      const head = rawHead.trim();
      if (!head) continue;
      const key = head.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ head, meaning });
    }
  }
  return map;
}

function loadLetter(letter) {
  if (!letters.has(letter)) {
    const p = fetch(new URL(`${letter}.txt`, DICT_BASE))
      .then((res) => {
        if (!res.ok) throw new Error(`dict ${letter}: ${res.status}`);
        return res.text();
      })
      .then(parse);
    // 失敗したときは、次にもう一度読み込めるよう覚えておかない
    p.catch(() => letters.delete(letter));
    letters.set(letter, p);
  }
  return letters.get(letter);
}

export function hasJapanese(text) {
  return /[぀-ヿ㐀-鿿ｦ-ﾟ]/.test(text);
}

function normalize(word) {
  return word.trim().replace(/[’‘]/g, "'").toLowerCase();
}

// 変化した形から、元の形の候補を作る(見つかりやすい順)
// 例: stars → star / walked → walk / cried → cry / running → run / making → make
export function baseForms(word) {
  const w = word;
  const out = [];
  const add = (s) => {
    if (s.length >= 2 && s !== w && !out.includes(s)) out.push(s);
  };
  const undouble = (s) => (/([b-df-hj-np-tv-z])\1$/.test(s) ? s.slice(0, -1) : null);

  if (w.endsWith("'s")) add(w.slice(0, -2));
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    const stem = w.slice(0, -2);
    add(stem);
    add(stem + 'e');
    const u = undouble(stem);
    if (u) add(u);
  }
  if (w.endsWith('ying')) add(w.slice(0, -4) + 'ie');
  if (w.endsWith('ing')) {
    const stem = w.slice(0, -3);
    add(stem);
    add(stem + 'e');
    const u = undouble(stem);
    if (u) add(u);
  }
  if (w.endsWith('in') || w.endsWith("in'")) {
    // 歌詞でよくある「runnin'」「lovin'」
    const stem = w.replace(/in'?$/, '');
    add(stem);
    add(stem + 'e');
    const u = undouble(stem);
    if (u) add(u);
  }
  for (const suf of ['est', 'er']) {
    if (!w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length);
    if (stem.endsWith('i')) add(stem.slice(0, -1) + 'y');
    add(stem);
    add(stem + 'e');
    const u = undouble(stem);
    if (u) add(u);
  }
  return out;
}

// 戻り値: { query, head, entries: [{ head, meaning }] } / 見つからなければ null
// head は実際に見つかった見出し(変化した形から探したときは元の形)
export async function lookup(word) {
  const query = normalize(word);
  if (!query || hasJapanese(query)) return null;
  const letter = query[0];
  if (!/[a-z]/.test(letter)) return null;
  const map = await loadLetter(letter);

  for (const key of [query, ...baseForms(query)]) {
    const entries = map.get(key);
    if (entries) return { query, head: key, entries };
  }
  return null;
}

// 意味を「 / 」ごとに分ける
export function senses(meaning) {
  return meaning.split(' / ').map((s) => s.trim()).filter(Boolean);
}

// 短い意味(韻タブ用): 最初のいくつかを、注記を外してつなげる
export function shortMeaning(meaning, count = 3) {
  return senses(meaning)
    .slice(0, count)
    .map((s) => s.replace(/〈[^〉]*〉|《[^》]*》/g, '').replace(/[『』]/g, '').trim())
    .filter(Boolean)
    .join(' / ');
}
