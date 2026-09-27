// スマホの画面の大きさを追いかける。
// iPhoneのSafariはキーボードが出ても画面の大きさが変わらないので、
// 実際に見えている範囲(visualViewport)の高さと位置を CSS の変数に入れ、画面をそこに合わせる。

export const mobileQuery = window.matchMedia('(max-width: 767.98px)');

export function isMobile() {
  return mobileQuery.matches;
}

const KEYBOARD_MIN = 120; // 見える高さがこれ以上減ったら、キーボードが出ているとみなす(px)

export function trackViewport(onChange = () => {}) {
  const vv = window.visualViewport;
  const root = document.documentElement;

  function update() {
    const height = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    root.style.setProperty('--vv-height', `${height}px`);
    root.style.setProperty('--vv-top', `${top}px`);
    root.classList.toggle('kb-open', window.innerHeight - height > KEYBOARD_MIN);
    onChange();
  }

  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  mobileQuery.addEventListener('change', update);
  update();
}

export function viewportHeight() {
  return window.visualViewport ? window.visualViewport.height : window.innerHeight;
}
