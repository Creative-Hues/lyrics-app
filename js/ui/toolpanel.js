// 道具パネル: タブで中身を切り替える入れ物。
// 中身(韻・単語メモなど)は panel(id) で受け取った場所に、それぞれの部品が描く。

import { esc } from './util.js';

export function createToolPanel(root, tabs) {
  root.innerHTML = `
    <div class="tool-tabs" role="tablist">
      ${tabs
        .map(
          (t) => `<button type="button" class="tool-tab" role="tab" id="tab-${t.id}"
                          data-tab="${t.id}" aria-controls="panel-${t.id}">${esc(t.label)}</button>`,
        )
        .join('')}
    </div>
    ${tabs
      .map(
        (t) => `<div class="tool-body" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}" hidden></div>`,
      )
      .join('')}
  `;

  function show(id) {
    for (const btn of root.querySelectorAll('.tool-tab')) {
      const on = btn.dataset.tab === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    }
    for (const body of root.querySelectorAll('.tool-body')) {
      body.hidden = body.id !== `panel-${id}`;
    }
  }

  root.querySelector('.tool-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) show(btn.dataset.tab);
  });

  show(tabs[0].id);

  return {
    show,
    panel: (id) => root.querySelector(`#panel-${id}`),
  };
}
