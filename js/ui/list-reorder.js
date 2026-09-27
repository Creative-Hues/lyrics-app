// 歌詞一覧の並べ替え(ドラッグ)。
// ブラウザ標準のドラッグ機能はiPhoneで使えないので、ポインター(マウス・指)の動きから自前で作る。
// マウスは少し動かしたらドラッグ開始。指(タッチ)は長押し(touchHoldDelay)で開始し、長押しの前に動いたら普通のスクロールにする。

const MOVE_THRESHOLD = 6; // この距離(px)以上動いたらドラッグとみなす
const EDGE = 40; // 枠の上下この距離(px)に来たら自動でスクロールする

export function enableReorder(list, { itemSelector, scroller, onDrop, touchHoldDelay = 450 }) {
  let pending = null; // 押したが、まだドラッグは始まっていない
  let drag = null; // ドラッグ中
  let justDragged = false;
  let holdTimer = null;

  function start() {
    const { item, pointerId } = pending;
    drag = { item, pointerId };
    pending = null;
    item.classList.add('is-dragging');
    list.classList.add('is-reordering');
    list.setPointerCapture(pointerId);
  }

  function cancelPending() {
    clearTimeout(holdTimer);
    pending = null;
  }

  list.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const item = e.target.closest(itemSelector);
    if (!item || !list.contains(item)) return;
    const holdDelay = e.pointerType === 'touch' ? touchHoldDelay : 0;
    pending = { item, pointerId: e.pointerId, x: e.clientX, y: e.clientY, holdDelay };
    if (holdDelay > 0) {
      holdTimer = setTimeout(() => {
        if (pending) start();
      }, holdDelay);
    }
  });

  list.addEventListener('pointermove', (e) => {
    if (pending && e.pointerId === pending.pointerId) {
      const moved = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (moved < MOVE_THRESHOLD) return;
      if (pending.holdDelay > 0) {
        // 長押しの前に動いたら、スクロールしたいだけなのでドラッグにしない
        cancelPending();
        return;
      }
      start();
    }
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();

    // 指の下にある歌詞の前か後ろに、ドラッグ中の歌詞を移す
    const others = [...list.querySelectorAll(itemSelector)].filter((el) => el !== drag.item);
    const after = others.find((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (after) {
      if (drag.item.nextElementSibling !== after) list.insertBefore(drag.item, after);
    } else if (list.lastElementChild !== drag.item) {
      list.appendChild(drag.item);
    }

    // 枠の端に来たら自動でスクロール
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (e.clientY < r.top + EDGE) scroller.scrollTop -= 10;
      else if (e.clientY > r.bottom - EDGE) scroller.scrollTop += 10;
    }
  });

  function finish(e) {
    if (pending && e.pointerId === pending.pointerId) cancelPending();
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.item.classList.remove('is-dragging');
    list.classList.remove('is-reordering');
    drag = null;
    justDragged = true;
    // ドラッグのあとに続けて起きる「クリック」で歌詞が開かないようにする
    setTimeout(() => (justDragged = false), 0);
    onDrop([...list.querySelectorAll(itemSelector)]);
  }

  // 指でドラッグしている間は、画面がスクロールしないようにする
  list.addEventListener(
    'touchmove',
    (e) => {
      if (drag) e.preventDefault();
    },
    { passive: false },
  );

  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);

  list.addEventListener(
    'click',
    (e) => {
      if (justDragged) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );

  return {
    isDragging: () => drag !== null,
  };
}
