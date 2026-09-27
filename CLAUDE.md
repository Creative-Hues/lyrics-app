# CLAUDE.md

英語の作詞を1つの画面でできるPWA「作詞アプリ」。仕様は `SPEC.md` を参照。

## 技術の決まり

- 素のHTML・CSS・JavaScriptで作る。ビルドツールは使わない。
- 有料のサービスは使わない。サーバーも持たない。
- 外部APIは次の3つだけ。すべてブラウザから直接呼ぶ。
  - Datamuse(韻検索)
  - LanguageTool(文法チェック)
  - GitHub API(同期)
- DeepLのAPIは使わない。文をコピーしてDeepLのサイトを開くだけにする。
- 英和辞書はEJDict-hand(パブリックドメイン)をアプリに同梱する。
- 端末の中の保存はIndexedDB。書いた内容は自動保存する。

## 守ること

- GitHubのトークンは、コードにもリポジトリにも絶対に書かない。端末の中にだけ保存する。
- LanguageToolはボタンを押したときだけ呼ぶ。自動で送らない。languagetool.orgへのリンクを表示する。

## 画面の作り方

- まずPCのChromeでちゃんと動くものを作る。スマホ対応はフェーズ4で行う。
- ただし、後でiPhoneのSafariの縦画面に切り替えやすいように、画面の部品を分けて作る。
- スマホでキーボードが出ても、タグボタンと道具パネルのボタンが隠れないようにする。

## ファイルの分け方

- `css/theme.css` 色 / `css/base.css` 部品の見た目 / `css/layout-pc.css` PCの並べ方(幅768px以上)/ `css/layout-mobile.css` スマホの並べ方(幅768px未満)
- `js/store.js` 歌詞・設定の読み書き(画面の部品はここを通す)/ `js/db.js` IndexedDB / `js/api/` 外部API / `js/ui/` 画面の部品
- `js/dict.js` 辞書の検索 / `js/deepl.js` DeepLを開く / `js/lyric-text.js` 行末の単語などの決まり(どれも画面に依存しない)
- `dict/` EJDict-handのデータ(変換せずにそのまま置く)
- `sw.js` Service Worker(アプリのファイルを端末に置いておく係)。**ファイルを増やしたら `APP_FILES` に足し、`VERSION` を上げる**
- `manifest.webmanifest` と `icons/` ホーム画面に置くための情報とアイコン
- 動作確認: `node dev/serve.js` → http://localhost:8000(ES modulesはファイルを直接開くと動かないため)
  - Service Workerが働くので、ファイルを変えたあとは、読み込み直しを2回すると新しい版になる

## 進め方

- フェーズごとに進める。各フェーズの前に計画を見せてから実装する。
- `SPEC.md` の「例」「要確認」「未記載」の点は、勝手に決めずに計画の段階で確認する。

## 説明のしかた

- 返事や説明は日本語で書く。
- 結論を先に、平易な言葉で書く。
- 専門用語には一言の説明をつける。
