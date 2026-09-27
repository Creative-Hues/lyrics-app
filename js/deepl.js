// DeepLのサイトを開く(APIは使わない)。
// 文はクリップボードにもコピーするので、サイトに文が入らなかったときも貼り直せる。

import { hasJapanese } from './dict.js';

// 日本語が入っていれば 日本語→英語、なければ 英語→日本語
export function deeplUrl(text) {
  const [from, to] = hasJapanese(text) ? ['ja', 'en'] : ['en', 'ja'];
  // DeepLのURLでは「/」が区切りになるため、「\/」の形にする。
  // 「/」まで %2F にすると文がそこで切れるので、「/」はそのまま残す(2026-09 に確認)
  const encoded = encodeURIComponent(text).replace(/%2F/g, '%5C/');
  return `https://www.deepl.com/translator#${from}/${to}/${encoded}`;
}

export async function openInDeepL(text) {
  // 新しいタブを開くとこのページから操作が離れてコピーできなくなるので、先にコピーする
  let copied = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copied = false;
  }
  window.open(deeplUrl(text), '_blank', 'noopener');
  return copied;
}
