// Bottom-centre toasts for buys, growth, host changes and errors.

export function createToasts() {
  const el = document.createElement('div');
  el.className = 'toasts';

  function push(text, kind) {
    const t = document.createElement('div');
    t.className = 'toast panel' + (kind === 'error' ? ' error' : '');
    t.innerHTML = '<span class="toast-bar"></span><span></span>';
    t.lastChild.textContent = text;
    el.appendChild(t);
    while (el.children.length > 4) el.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 220);
    }, kind === 'error' ? 4200 : 2600);
  }

  return { el, push };
}
