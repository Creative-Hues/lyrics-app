// 起動と、画面の部品どうしのつなぎ。

import * as store from './store.js';
import { createLyricList } from './ui/list.js';
import { createEditor } from './ui/editor.js';
import { createTagBar } from './ui/tags.js';
import { createToolPanel } from './ui/toolpanel.js';
import { createRhymePanel } from './ui/rhyme.js';
import { createMemoPanel } from './ui/memo.js';
import { createDictionaryPanel } from './ui/dictionary.js';
import { createScratchPanel } from './ui/scratch.js';
import { createGrammarPanel } from './ui/grammar.js';
import { createAskAi, askAi } from './ui/ask-ai.js';
import { createMenu } from './ui/menu.js';
import { createSheet } from './ui/sheet.js';
import { trackViewport } from './ui/viewport.js';
import { createSyncUi } from './ui/sync-settings.js';
import { setupSync, syncNow, syncIfStale, pushChanges } from './sync.js';
import { openInDeepL } from './deepl.js';
import { toast } from './ui/util.js';

const $ = (sel) => document.querySelector(sel);

const THEME_COLORS = { light: '#ffffff', dark: '#1e2023' };

function applyTheme() {
  const theme = store.getTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[theme];
  $('#theme-toggle').textContent = theme === 'dark' ? 'ライトにする' : 'ダークにする';
}

// スマホで「歌詞一覧」と「作詞画面」を切り替える(PCでは両方見えているので影響しない)
function showScreen(name) {
  document.body.dataset.screen = name;
  store.setLocal('screen', name);
}

// ホーム画面に置けるようにし、ファイルを端末に置いておく係(Service Worker)を登録する
function setupOffline() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error(err));
  }
  // ブラウザに「データを残してほしい」とお願いする
  navigator.storage?.persist?.().catch(() => {});
}

async function start() {
  await store.init();
  applyTheme();

  const toolPanel = createToolPanel($('#tool-panel'), [
    { id: 'rhyme', label: '韻' },
    { id: 'dict', label: '辞書' },
    { id: 'memo', label: '単語メモ' },
    { id: 'scratch', label: 'こねこね' },
    { id: 'grammar', label: '文法' },
  ]);

  // スマホの道具パネル(下から引き出すシート)
  const sheet = createSheet({
    panel: $('#tool-panel'),
    handle: $('.sheet-handle'),
    toggle: $('#kb-tools'),
    fixedParts: () => [$('.mobile-head'), $('.sheet-handle'), $('.kb-bar')],
  });
  trackViewport(() => sheet.refresh());

  // 道具パネルのタブを出す。スマホではシートも開く
  function showTool(id) {
    toolPanel.show(id);
    sheet.open('half');
  }

  function pickWord(word) {
    showTool('rhyme');
    rhyme.search(word);
    dictionary.show(word);
  }

  const editor = createEditor($('#editor'), { onWordPick: pickWord, onNew: newLyric });

  const getLyricId = () => editor.currentId;
  const rhyme = createRhymePanel(toolPanel.panel('rhyme'), {
    getLyricId,
    onShowDictionary: () => showTool('dict'),
  });
  const dictionary = createDictionaryPanel(toolPanel.panel('dict'));
  const scratch = createScratchPanel(toolPanel.panel('scratch'), { getLyricId });
  const grammar = createGrammarPanel(toolPanel.panel('grammar'), { editor });
  createAskAi($('#ask-ai'), $('#ask-ai-menu'), { editor });
  const memo = createMemoPanel(toolPanel.panel('memo'), {
    getLyricId,
    onInsert: (word) => editor.insertWord(word),
  });

  const tags = createTagBar($('#tag-bar'), $('#tag-dialog'), {
    onInsert: (tag) => editor.insertTag(tag),
    mirrors: [$('.kb-tags')],
  });

  const list = createLyricList($('#lyric-list'), { onOpen: openLyric, onNew: newLyric });

  function openLyric(id) {
    const lyric = store.getLyric(id);
    if (!lyric) return;
    editor.open(lyric);
    list.setActive(id);
    memo.refresh();
    rhyme.refresh();
    scratch.refresh();
    grammar.refresh();
    store.setLocal('lastOpenedId', id);
    showScreen('writer');
  }

  function newLyric() {
    editor.flush();
    const view = store.getLocal('view');
    const folder = view === store.ALL ? store.UNFILED : view;
    const lyric = store.createLyric(folder);
    openLyric(lyric.id);
    editor.focusTitle();
  }

  store.on('lyric-deleted', (id) => {
    if (editor.currentId !== id) return;
    editor.close();
    list.setActive(null);
    memo.refresh();
    rhyme.refresh();
    scratch.refresh();
    grammar.refresh();
    showScreen('list');
  });

  store.on('error', toast);

  // ---- 同期 ----

  const syncUi = createSyncUi({
    status: $('#sync-status'),
    syncButton: $('#sync-btn'),
    settingsButton: $('#sync-settings-btn'),
    dialog: $('#sync-dialog'),
  });

  // 同期の前に、書きかけの内容を保存する
  setupSync({
    flush: () => {
      editor.flush();
      scratch.flush();
    },
  });

  // 同期で、開いている歌詞の中身が入れ替わったとき
  store.on('lyric-replaced', (id) => {
    if (editor.currentId !== id) return;
    editor.reload(store.getLyric(id));
    scratch.reload();
    memo.refresh();
    grammar.refresh();
  });

  // ---- エディタから送る(DeepL・こねこね欄) ----

  function textToSend() {
    const text = editor.getSendText();
    if (!text) toast(editor.currentId ? '送る文がありません' : '歌詞を開いてください');
    return text;
  }

  // DeepLで開く: 選んだ部分、なければカーソルのある行
  async function sendToDeepL() {
    const text = textToSend();
    if (text && !(await openInDeepL(text))) toast('コピーできませんでした');
  }

  function sendToScratch() {
    const text = textToSend();
    if (!text) return;
    scratch.append(text);
    showTool('scratch');
  }

  $('#send-deepl').addEventListener('click', sendToDeepL);
  $('#send-scratch').addEventListener('click', sendToScratch);

  // ---- スマホだけの操作 ----

  $('#back-to-list').addEventListener('click', () => {
    editor.flush();
    scratch.flush();
    sheet.close();
    showScreen('list');
  });

  // 「韻」ボタン: カーソルのある単語を調べる
  $('#kb-rhyme').addEventListener('mousedown', (e) => e.preventDefault());
  $('#kb-rhyme').addEventListener('click', () => {
    const word = editor.getWordAtCursor();
    if (word) pickWord(word);
    else toast(editor.currentId ? '調べたい単語にカーソルを置いてください' : '歌詞を開いてください');
  });

  // 「…」メニュー: DeepL・こねこね・AIに聞く・タグを編集
  createMenu($('#more-btn'), $('#more-menu'), {
    getItems: () => [
      { label: 'DeepLで開く', action: sendToDeepL },
      { label: 'こねこねへ送る', action: sendToScratch },
      { label: null },
      ...store.getAiPrompts().map((p, i) => ({ label: `AIに聞く: ${p.label}`, action: () => askAi(editor, i) })),
      { label: null },
      { label: 'タグを編集', action: () => tags.openEditor() },
      { label: null },
      { label: '同期', action: () => syncUi.syncOrSetup() },
    ],
  });

  // ---- 設定・保存 ----

  $('#theme-toggle').addEventListener('click', () => {
    store.setTheme(store.getTheme() === 'dark' ? 'light' : 'dark');
  });
  store.on('settings', applyTheme);

  // タブを閉じる・別のタブに移る・アプリを裏に回すときに、まだ保存していない分を保存し、
  // 変えた分をGitHubに送る。戻ってきたときは、前回から1分以上たっていたら同期する
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      editor.flush();
      scratch.flush();
      pushChanges();
    } else {
      syncIfStale();
    }
  });
  window.addEventListener('pagehide', () => {
    editor.flush();
    scratch.flush();
  });

  // 前に開いていた歌詞を、書いていた位置から再開する
  const lastId = store.getLocal('lastOpenedId');
  if (lastId && store.getLyric(lastId)) {
    openLyric(lastId);
    if (store.getLocal('screen') === 'list') showScreen('list');
  } else {
    scratch.refresh();
    showScreen('list');
  }

  setupOffline();
  syncNow({ auto: true }); // アプリを開いたとき
}

start().catch((err) => {
  console.error(err);
  document.body.innerHTML = '<p style="padding:24px">アプリを起動できませんでした。ページを読み込み直してください。</p>';
});
