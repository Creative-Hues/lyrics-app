// 画面の部品で共通して使う小さな道具。

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

let toastTimer = null;

// 画面の下に短いお知らせを出す
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 1800);
}

export async function copyText(text, doneMessage = 'コピーしました') {
  try {
    await navigator.clipboard.writeText(text);
    toast(doneMessage);
  } catch {
    toast('コピーできませんでした');
  }
}

// 例: 2026-09-27T12:30:00+09:00 → 2026/09/27
export function formatDate(iso) {
  return iso ? iso.slice(0, 10).replaceAll('-', '/') : '';
}
