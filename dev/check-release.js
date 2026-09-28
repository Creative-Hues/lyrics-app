// 公開(push)の前に流す確認。問題があれば理由を出して、終了コード1で終わる。
// 使い方: node dev/check-release.js
//
// 1. js/ css/ icons/ などアプリのファイルが、すべて sw.js の APP_FILES に入っているか(ないファイルが入っていないか)
// 2. 公開済みの版(origin/main)からアプリのファイルが変わっているのに、sw.js の VERSION が同じままでないか
//    (VERSION を上げないと、新しい版が端末に届かない)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const problems = [];

// ---- sw.js を読む ----

function readSw(text) {
  const version = /const VERSION = '([^']+)'/.exec(text)?.[1];
  const list = /const APP_FILES = \[([\s\S]*?)\];/.exec(text)?.[1] || '';
  const files = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return { version, files };
}

const sw = readSw(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'));
if (!sw.version) problems.push('sw.js の VERSION が読めません');

// ---- 1. APP_FILES ----

const isAppFile = (p) =>
  p === 'index.html' ||
  p === 'manifest.webmanifest' ||
  p === 'sw.js' ||
  /^(js|css)\/.+\.(js|css)$/.test(p) ||
  /^icons\/.+\.png$/.test(p);

function walk(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const p = `${dir}/${d.name}`;
    return d.isDirectory() ? walk(p) : [p];
  });
}

const onDisk = ['index.html', 'manifest.webmanifest', ...walk('js'), ...walk('css'), ...walk('icons')].filter(
  (p) => isAppFile(p) && p !== 'sw.js',
);
for (const p of onDisk) {
  if (!sw.files.includes(p)) problems.push(`APP_FILES に入っていません: ${p}`);
}
for (const p of sw.files) {
  if (p !== './' && !fs.existsSync(path.join(ROOT, p))) problems.push(`APP_FILES にあるのに、ファイルがありません: ${p}`);
}

// ---- 2. VERSION の上げ忘れ ----

try {
  git('fetch -q origin');
} catch {
  console.log('(GitHubにつながらないので、手元にある origin/main と比べます)');
}
let published = null;
try {
  published = readSw(git('show origin/main:sw.js')).version;
} catch {
  console.log('(公開済みの sw.js が見つからないので、VERSION の確認は飛ばします)');
}
if (published) {
  const changed = new Set(
    [...git('diff --name-only origin/main').split('\n'), ...git('ls-files --others --exclude-standard').split('\n')]
      .map((s) => s.trim())
      .filter(isAppFile),
  );
  if (changed.size && sw.version === published) {
    problems.push(
      `アプリのファイルが変わっているのに、VERSION が公開済みと同じ(${published})です。sw.js の VERSION を上げてください\n` +
        [...changed].map((p) => `    変わったファイル: ${p}`).join('\n'),
    );
  }
  if (!changed.size) console.log(`アプリのファイルは公開済みの版から変わっていません(VERSION ${sw.version})`);
  else if (sw.version !== published) console.log(`VERSION: ${published} → ${sw.version}(変わったファイル ${changed.size}個)`);
}

// ---- 結果 ----

if (problems.length) {
  console.log('\n公開の前に直すことがあります:');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('OK: 公開してだいじょうぶです');
