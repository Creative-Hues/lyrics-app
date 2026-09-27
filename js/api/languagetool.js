// LanguageTool(文法チェックの無料サービス)
// https://languagetool.org/http-api/
// 決まり: ボタンを押したときだけ呼ぶ(自動で送らない)。1分20回・1回2万文字まで。

const ENDPOINT = 'https://api.languagetool.org/v2/check';

export const MAX_CHARS = 20000;

// 歌詞は1行が1文ではないので、文の先頭の大文字・引用符・ダッシュの規則は切っておく
const DISABLED_RULES = ['UPPERCASE_SENTENCE_START', 'EN_QUOTES', 'DASH_RULE'];

export class RateLimitError extends Error {}

// 戻り値: LanguageTool の matches(offset / length は text の中の位置)
export async function checkGrammar(text) {
  // フォーム形式で送る(ブラウザの事前確認が要らない、いちばん単純な送り方)
  const body = new URLSearchParams({
    text,
    language: 'en-US',
    disabledRules: DISABLED_RULES.join(','),
  });
  const res = await fetch(ENDPOINT, { method: 'POST', body });
  if (res.status === 429) throw new RateLimitError('LanguageTool: too many requests');
  if (!res.ok) throw new Error(`LanguageTool: ${res.status}`);
  const data = await res.json();
  return data.matches;
}
