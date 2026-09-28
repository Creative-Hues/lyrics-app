// 同期を手元で確かめるための、GitHub API のふりをする小さなサーバー(公開には使わない)。
// 同期で使う分(リポジトリの情報・ファイルの読み書き・削除)だけを、メモリの中でまねる。
//
// 使い方:
//   node dev/fake-github.js            → http://localhost:8787
//   アプリ(http://localhost:8000)の開発者ツールで
//     localStorage.setItem('dev:githubApi', 'http://localhost:8787')
//   として読み込み直し、「同期の設定」でトークンに fake-token を入れる。
// 確かめ用: GET /__files で中身を見る、POST /__private?value=0 で「公開」のふりをする。

const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8787;
const TOKEN = process.env.FAKE_TOKEN || 'fake-token';

const files = new Map(); // path → { text, sha }
let isPrivate = true;

const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version',
    'Cache-Control': 'private, max-age=60', // 本物と同じく、しまっておける印をつける
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') return send(res, 204);

    // 確かめ用
    if (url.pathname === '/__files') return send(res, 200, Object.fromEntries([...files].map(([p, f]) => [p, JSON.parse(f.text)])));
    if (url.pathname === '/__private') {
      isPrivate = url.searchParams.get('value') !== '0';
      return send(res, 200, { isPrivate });
    }
    if (url.pathname === '/__reset') {
      files.clear();
      isPrivate = true;
      return send(res, 200, {});
    }
    if (url.pathname === '/__edit') {
      // ほかの端末が書きこんだふり: { path, text }
      const { path, text } = await readBody(req);
      files.set(path, { text, sha: sha1(text) });
      return send(res, 200, {});
    }

    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: 'Bad credentials' });

    const m = /^\/repos\/([^/]+)\/([^/]+)(?:\/contents\/(.*))?$/.exec(url.pathname);
    if (!m) return send(res, 404, { message: 'Not Found' });
    const path = m[3] === undefined ? null : decodeURIComponent(m[3]);

    if (path === null) {
      return send(res, 200, { name: m[2], private: isPrivate, permissions: { push: true } });
    }

    if (req.method === 'GET') {
      const file = files.get(path);
      if (file) {
        return send(res, 200, {
          type: 'file',
          name: path.split('/').pop(),
          path,
          sha: file.sha,
          encoding: 'base64',
          // 本物と同じく、60文字ごとに改行を入れる
          content: Buffer.from(file.text).toString('base64').replace(/.{60}/g, '$&\n'),
        });
      }
      const inDir = [...files].filter(([p]) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/'));
      if (!inDir.length) return send(res, 404, { message: 'Not Found' });
      return send(res, 200, inDir.map(([p, f]) => ({ type: 'file', name: p.split('/').pop(), path: p, sha: f.sha })));
    }

    const body = await readBody(req);
    const current = files.get(path);

    if (req.method === 'PUT') {
      if (current && !body.sha) return send(res, 422, { message: '"sha" wasn\'t supplied.' });
      if (current && body.sha !== current.sha) return send(res, 409, { message: 'does not match' });
      if (!current && body.sha) return send(res, 404, { message: 'Not Found' });
      const text = Buffer.from(body.content, 'base64').toString('utf8');
      const file = { text, sha: sha1(text) };
      files.set(path, file);
      return send(res, current ? 200 : 201, { content: { path, sha: file.sha } });
    }

    if (req.method === 'DELETE') {
      if (!current) return send(res, 404, { message: 'Not Found' });
      if (body.sha !== current.sha) return send(res, 409, { message: 'does not match' });
      files.delete(path);
      return send(res, 200, { commit: {} });
    }

    send(res, 405, { message: 'Method Not Allowed' });
  })
  .listen(PORT, () => console.log(`fake GitHub: http://localhost:${PORT}`));
