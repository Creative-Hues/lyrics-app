// 画面の部品で共通して使う小さな道具。

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

let toastTimer = null;

// 画面の下に短いお知らせを出す(ms: 出しておく時間)
export function toast(message, ms = 1800) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), ms);
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

// 例: 2026-09-28T14:05:00+09:00 → 9/28 14:05(この端末の時刻で出す)
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
