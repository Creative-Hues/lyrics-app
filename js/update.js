// 新しい版への切り替え(SPEC 9章)。
// 新しい版の Service Worker(sw.js)は、届いても待たせておき、次のときに切り替える:
// - 開いた直後・戻ってきた直後(まだ何も操作していない): 自動で切り替えて読み込み直す
// - 使っている途中: 画面の上に「新しい版があります [更新する]」の帯を出し、押したときに切り替える

const CHECK_INTERVAL = 10 * 60 * 1000; // 戻ってきたとき、前回からこれ以上たっていたら新しい版を確かめる
const AUTO_WINDOW = 30 * 1000; // 開いて(戻って)からこの時間内で、まだ操作していなければ自動で切り替える

let registration = null;
let lastCheck = 0;
let shownAt = Date.now(); // 開いた・戻ってきた時刻
let engaged = false; // 開いて(戻って)から、何か操作したか
let reloading = false;
let hooks = { beforeReload: () => {}, onReady: () => {} };

// beforeReload: 読み込み直す前に、書きかけを保存する / onReady: 帯を出す
export function setupUpdates({ beforeReload, onReady }) {
  if (!('serviceWorker' in navigator)) return;
  hooks = { beforeReload, onReady };

  for (const type of ['pointerdown', 'keydown', 'input']) {
    document.addEventListener(type, () => (engaged = true), { capture: true, passive: true });
  }

  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      registration = reg;
      lastCheck = Date.now();
      reg.addEventListener('updatefound', () => watch(reg.installing));
      watch(reg.installing);
      offer();
    })
    .catch((err) => console.error(err));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !registration) return;
    shownAt = Date.now();
    engaged = false;
    offer();
    if (Date.now() - lastCheck >= CHECK_INTERVAL) {
      lastCheck = Date.now();
      registration.update().catch(() => {}); // 電波がなければ、次の機会に
    }
  });
}

// 新しい版を取ってき終えたら知らせてもらう
function watch(worker) {
  worker?.addEventListener('statechange', () => {
    if (worker.state === 'installed') offer();
  });
}

// 待っている新しい版があれば、開いた直後なら切り替え、使っている途中なら帯を出す
function offer() {
  // controller がない = はじめて開いたとき。新しい版はすぐ使われるので、何もしない
  if (!registration?.waiting || !navigator.serviceWorker.controller) return;
  if (!engaged && Date.now() - shownAt < AUTO_WINDOW) applyUpdate();
  else hooks.onReady();
}

// 新しい版に切り替えて、読み込み直す
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting || reloading) return;
  reloading = true;
  hooks.beforeReload();
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('SKIP_WAITING');
}
