// GitHub API(同期)。リポジトリの中のファイルを読み書きする。
// トークンは呼ぶ側から受け取るだけで、ここには置かない。
// https://docs.github.com/ja/rest/repos/contents

// 手元の確かめ(dev/fake-github.js)のときだけ、別の場所を使えるようにする
function apiBase() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  return (local && localStorage.getItem('dev:githubApi')) || 'https://api.github.com';
}

// kind: 'offline' 電波がない / 'auth' トークンが違う / 'forbidden' 権限が足りない / 'notfound' 見つからない /
//       'conflict' 途中で変わった / 'limit' 使いすぎ / 'other' そのほか
export class GitHubError extends Error {
  constructor(kind, status = 0) {
    super(`GitHub: ${kind} (${status})`);
    this.kind = kind;
    this.status = status;
  }
}

// ---- 文字と Base64(ファイルの中身を送るときの形)の変換。日本語が化けないようにする ----

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ---- 呼び出し ----

export function createGitHub({ owner, repo, token }) {
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const filePath = (path) => `${repoPath}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;

  async function call(method, path, { body, keepalive = false, notFoundOk = false } = {}) {
    if (!navigator.onLine) throw new GitHubError('offline');
    const request = (keepalive) =>
      fetch(apiBase() + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store', // 古い一覧を使わないよう、ブラウザにしまっておかせない
        keepalive,
      });
    let res;
    try {
      // keepalive(ページが裏に回っても送り終える)が使えないブラウザでは、普通に送り直す
      res = await request(keepalive).catch((err) => (keepalive ? request(false) : Promise.reject(err)));
    } catch {
      throw new GitHubError(navigator.onLine ? 'other' : 'offline');
    }
    if (res.ok) return res.status === 204 ? null : res.json();
    if (res.status === 404 && notFoundOk) return null;
    if (res.status === 401) throw new GitHubError('auth', 401);
    if (res.status === 404) throw new GitHubError('notfound', 404);
    if (res.status === 409 || res.status === 422) throw new GitHubError('conflict', res.status);
    if (res.status === 403 || res.status === 429) {
      const limited = res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429;
      throw new GitHubError(limited ? 'limit' : 'forbidden', res.status);
    }
    throw new GitHubError('other', res.status);
  }

  return {
    // リポジトリの情報(プライベートか、書きこめるか)
    getRepo() {
      return call('GET', repoPath);
    },

    // フォルダの中のファイル: [{ name, path, sha }]。フォルダがなければ(空のリポジトリも)[]
    async list(dir) {
      const items = await call('GET', filePath(dir), { notFoundOk: true });
      return Array.isArray(items) ? items.filter((it) => it.type === 'file') : [];
    },

    // ファイルの中身: { text, sha }。なければ null
    async read(path) {
      const file = await call('GET', filePath(path), { notFoundOk: true });
      return file ? { text: fromBase64(file.content), sha: file.sha } : null;
    },

    // 書きこむ。sha: 上書きするときの、今の版(新しく作るときは null)。戻り値: 新しい版の sha
    async write(path, text, sha, message, { keepalive = false } = {}) {
      const body = { message, content: toBase64(text), ...(sha ? { sha } : {}) };
      const res = await call('PUT', filePath(path), { body, keepalive });
      return res.content.sha;
    },

    remove(path, sha, message, { keepalive = false } = {}) {
      return call('DELETE', filePath(path), { body: { message, sha }, keepalive });
    },
  };
}
