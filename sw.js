// Service Worker(アプリのファイルを端末に置いておく係)。
// - 最初に開いたときに、アプリのファイルと辞書を端末に保存する(電波がなくても開ける・辞書が引ける)。
// - 開いたときは端末に置いた版をすぐ出し、裏で新しい版を取ってくる(次に開いたときに新しい版になる)。
// - 外のサービス(Datamuse・LanguageTool など)への問い合わせには手を出さない。
//
// ファイルを増やしたら APP_FILES に足し、VERSION を上げる。

const VERSION = 'v2';
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
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

const DICT_FILES = [...'abcdefghijklmnopqrstuvwxyz'].map((c) => `dict/${c}.txt`);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...APP_FILES, ...DICT_FILES]))
      .then(() => self.skipWaiting()),
  );
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
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(fresh); // 裏で新しい版を取ってくる
        return cached;
      }
      return (await fresh) || new Response('オフラインです', { status: 503 });
    }),
  );
});
