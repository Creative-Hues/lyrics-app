// Service Worker(アプリのファイルを端末に置いておく係)。
// - 最初に開いたときに、アプリのファイルと辞書を端末に保存する(電波がなくても開ける・辞書が引ける)。
// - ふだんは端末に置いた版だけを使う。ファイルを1つずつ入れ替えることはしない(古いファイルと新しいファイルが混ざらないように)。
// - 新しい版(VERSION を上げた sw.js)が届いたら、全ファイルを取ってきて待たせておく。
//   画面の「更新する」を押したとき(または開いた直後)に切り替わる(js/update.js)。
// - 外のサービス(Datamuse・LanguageTool・GitHub など)への問い合わせには手を出さない。
//
// アプリのファイルを変えたら VERSION を上げる。ファイルを増やしたら APP_FILES にも足す。
// 公開(push)の前に node dev/check-release.js を流す。

const VERSION = 'v3';
const CACHE = `sakushi-${VERSION}`;

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/theme.css',
  'css/base.css',
  'css/layout-pc.css',
  'css/layout-mobile.css',
  'js/main.js',
  'js/store.js',
  'js/db.js',
  'js/dict.js',
  'js/deepl.js',
  'js/lyric-text.js',
  'js/sync.js',
  'js/update.js',
  'js/api/datamuse.js',
  'js/api/languagetool.js',
  'js/api/github.js',
  'js/ui/util.js',
  'js/ui/list.js',
  'js/ui/list-reorder.js',
  'js/ui/editor.js',
  'js/ui/tags.js',
  'js/ui/toolpanel.js',
  'js/ui/rhyme.js',
  'js/ui/memo.js',
  'js/ui/dictionary.js',
  'js/ui/scratch.js',
  'js/ui/grammar.js',
  'js/ui/ask-ai.js',
  'js/ui/menu.js',
  'js/ui/sheet.js',
  'js/ui/viewport.js',
  'js/ui/sync-settings.js',
  'js/ui/update-bar.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

const DICT_FILES = [...'abcdefghijklmnopqrstuvwxyz'].map((c) => `dict/${c}.txt`);

// 「更新する」ボタンがない前の版(v1・v2)が動いていたら、ボタンを出せないので、待たずに切り替える
const OLD_CACHES = ['sakushi-v1', 'sakushi-v2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // ブラウザの一時保存(HTTPキャッシュ)を通さずに、GitHubから直接取ってくる。
      // 通すと、10分以内に取った古いファイルが混ざることがある
      await cache.addAll(APP_FILES.map((f) => new Request(f, { cache: 'reload' })));
      // 辞書は版が変わっても中身が同じなので、前の版の保存から移す(なければ取ってくる)
      await Promise.all(
        DICT_FILES.map(async (f) => {
          const old = await caches.match(f);
          if (old) await cache.put(f, old);
          else await cache.add(new Request(f, { cache: 'reload' }));
        }),
      );
      const keys = await caches.keys();
      if (keys.some((k) => OLD_CACHES.includes(k))) self.skipWaiting();
    })(),
  );
});

// 画面の「更新する」から呼ばれる: 待たせていた新しい版に切り替える
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// 古い版の保存を消す
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sakushi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // ページを開くときは、いつも同じ index.html を使う
  const key = req.mode === 'navigate' ? new URL('./', self.registration.scope).href : req;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(key, { ignoreSearch: true });
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch {
        return new Response('オフラインです', { status: 503 });
      }
    })(),
  );
});
