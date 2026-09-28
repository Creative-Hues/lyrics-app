// 画面の上の帯「新しい版があります [更新する] [×]」。
// × で閉じても、次に開いたとき(戻ってきたとき)にまた出る。

export function createUpdateBar(root, { onUpdate, onChange = () => {} }) {
  root.innerHTML = `
    <span class="update-bar-text">新しい版があります</span>
    <button type="button" class="btn btn-small btn-primary" data-act="update">更新する</button>
    <button type="button" class="btn btn-small update-bar-close" data-act="later" aria-label="あとで">×</button>
  `;
  const text = root.querySelector('.update-bar-text');

  function setHidden(hidden) {
    root.hidden = hidden;
    onChange();
  }

  root.addEventListener('click', (e) => {
    const act = e.target.closest('button[data-act]')?.dataset.act;
    if (act === 'update') {
      text.textContent = '更新しています…';
      root.querySelectorAll('button').forEach((b) => (b.disabled = true));
      onUpdate();
    }
    if (act === 'later') setHidden(true);
  });

  return {
    show: () => setHidden(false),
  };
}
