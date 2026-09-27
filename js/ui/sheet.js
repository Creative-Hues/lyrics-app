// スマホの道具パネル: 下から引き出すシート。高さは 閉じる / 半分 / ほぼ全部 の3段階。
// 取っ手を指で上下に動かして高さを変えられる。PCでは何もしない。

import { isMobile, viewportHeight } from './viewport.js';

const EDITOR_MIN = 48; // 「ほぼ全部」のときも、エディタをこれだけは見せておく(px)

export function createSheet({ panel, handle, toggle, fixedParts }) {
  let state = 'closed';
  let dragging = null;

  // 各段階の高さ。見えている高さから、ヘッダーやバーなど動かない部分を引いて決める
  function heights() {
    const fixed = fixedParts().reduce((sum, el) => sum + el.offsetHeight, 0);
    const available = Math.max(0, viewportHeight() - fixed);
    return {
      closed: 0,
      half: Math.round(available * 0.5),
      full: Math.max(0, Math.round(available - EDITOR_MIN)),
    };
  }

  function apply() {
    if (!isMobile()) {
      panel.style.height = '';
      return;
    }
    panel.style.height = `${heights()[state]}px`;
    toggle.setAttribute('aria-expanded', String(state !== 'closed'));
    toggle.classList.toggle('is-active', state !== 'closed');
  }

  function set(next) {
    state = next;
    apply();
  }

  toggle.addEventListener('mousedown', (e) => e.preventDefault());
  toggle.addEventListener('click', () => set(state === 'closed' ? 'half' : 'closed'));

  // 取っ手のドラッグ
  handle.addEventListener('pointerdown', (e) => {
    if (!isMobile()) return;
    dragging = { y: e.clientY, h: panel.offsetHeight, pointerId: e.pointerId };
    handle.setPointerCapture(e.pointerId);
    panel.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const max = heights().full;
    const h = Math.min(max, Math.max(0, dragging.h + (dragging.y - e.clientY)));
    panel.style.height = `${h}px`;
  });
  function endDrag(e) {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    dragging = null;
    panel.classList.remove('is-dragging');
    // いちばん近い段階に合わせる
    const h = panel.offsetHeight;
    const hs = heights();
    const nearest = Object.entries(hs).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
    set(nearest);
  }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  return {
    // 閉じていれば開く(すでに開いていれば、そのままの高さ)
    open(level = 'half') {
      if (state === 'closed') set(level);
    },
    close() {
      set('closed');
    },
    // 画面の大きさが変わったとき(キーボードが出た・消えたときなど)
    refresh: apply,
  };
}
