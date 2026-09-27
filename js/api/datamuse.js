// Datamuse API(韻を調べる無料のサービス。APIキー不要)
// https://www.datamuse.com/api/

const BASE = 'https://api.datamuse.com/words';

// mode: 'perfect'(完全な韻) / 'near'(近い韻)
// 戻り値: [{ word, syllables }] Datamuseが返す順(韻が近い順)のまま、最大10個
export async function findRhymes(word, mode) {
  const rel = mode === 'near' ? 'rel_nry' : 'rel_rhy';
  const url = `${BASE}?${rel}=${encodeURIComponent(word)}&md=s&max=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Datamuse: ${res.status}`);
  const data = await res.json();
  return data.map((d) => ({ word: d.word, syllables: d.numSyllables ?? null }));
}
