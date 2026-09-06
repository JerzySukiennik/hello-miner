// Upgrade tree overlay: layered card graph laid out from node `requires`, with SVG connectors.

const CW = 150;
const CH = 96;
const GX = 26;
const GY = 58;

const GLYPH = {
  grid: '#', speed: '>>', loops: '@', vars: 'x=', sensors: '?', coal: 'C', iron: 'Fe',
  place: '+', scan: 'sc', wait: 'zz', print: 'p', functions: 'fn', for_loops: 'for',
  lists: '[]', dicts: '{}', drones: 'dr', gold: 'Au', crystal: '*',
};

export function createTree(opts) {
  const TREE = opts.tree;
  const ORE_INFO = opts.oreInfo;
  const byId = new Map(TREE.map((n) => [n.id, n]));

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.hidden = true;
  scrim.innerHTML =
    '<div class="tree-wrap panel">' +
    '<div class="pane-head"><h2>Upgrades</h2><div class="pane-inv"></div>' +
    '<span class="pane-esc">Esc to close</span>' +
    '<button class="btn t-close">Close</button></div>' +
    '<div class="tree-scroll"><div class="tree-canvas"><svg></svg></div></div></div>';

  const canvas = scrim.querySelector('.tree-canvas');
  const svg = scrim.querySelector('svg');
  const inv = scrim.querySelector('.pane-inv');
  scrim.querySelector('.t-close').addEventListener('click', () => { api.close(); document.querySelector('.hm-ui').classList.remove('tree-open'); document.body.classList.remove('tree-open'); });


  const depth = new Map();
  function depthOf(id, seen) {
    if (depth.has(id)) return depth.get(id);
    const n = byId.get(id);
    if (!n) return 0;
    const guard = seen || new Set();
    if (guard.has(id)) return 0;
    guard.add(id);
    const d = (n.requires || []).reduce((m, r) => Math.max(m, depthOf(r, guard) + 1), 0);
    depth.set(id, d);
    return d;
  }

  const rows = [];
  for (const n of TREE) {
    const d = depthOf(n.id);
    (rows[d] = rows[d] || []).push(n);
  }

  const pos = new Map();
  let width = 0;
  rows.forEach((row, d) => {
    row.sort((a, b) => {
      const ax = (a.requires || []).reduce((s, r) => s + (pos.get(r) ? pos.get(r).x : 0), 0) / Math.max(1, (a.requires || []).length);
      const bx = (b.requires || []).reduce((s, r) => s + (pos.get(r) ? pos.get(r).x : 0), 0) / Math.max(1, (b.requires || []).length);
      return ax - bx;
    });
    const w = row.length * CW + (row.length - 1) * GX;
    width = Math.max(width, w);
    row.forEach((n, i) => pos.set(n.id, { x: i * (CW + GX), y: d * (CH + GY), row: d, i }));
  });
  rows.forEach((row) => {
    const w = row.length * CW + (row.length - 1) * GX;
    const off = (width - w) / 2;
    row.forEach((n) => { pos.get(n.id).x += off; });
  });
  const height = rows.length * CH + (rows.length - 1) * GY;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  let paths = '';
  for (const n of TREE) {
    const c = pos.get(n.id);
    for (const r of n.requires || []) {
      const p = pos.get(r);
      if (!p) continue;
      const x1 = p.x + CW / 2;
      const y1 = p.y + CH;
      const x2 = c.x + CW / 2;
      const y2 = c.y;
      const my = y1 + GY / 2;
      paths += '<path d="M' + x1 + ' ' + y1 + 'V' + my + 'H' + x2 + 'V' + y2 + '"/>';
    }
  }
  svg.innerHTML = paths;

  const cards = new Map();
  for (const n of TREE) {
    const p = pos.get(n.id);
    const card = document.createElement('div');
    card.className = 'node';
    card.style.left = p.x + 'px';
    card.style.top = p.y + 'px';
    card.innerHTML =
      '<div class="node-top"><span class="node-ic"></span><span class="node-name"></span><span class="node-lv"></span></div>' +
      '<div class="node-desc"></div>' +
      '<div class="node-bot"><span class="node-costs"></span><button class="btn btn-primary node-buy">Buy</button></div>';
    card.querySelector('.node-ic').textContent = GLYPH[n.id] || n.id.slice(0, 2);
    card.querySelector('.node-ic').style.background = '#f2c94c';
    card.querySelector('.node-name').textContent = n.name;
    card.querySelector('.node-desc').textContent = n.desc || '';
    card.querySelector('.node-buy').addEventListener('click', () => opts.onBuy(n.id));
    canvas.appendChild(card);
    cards.set(n.id, card);
  }

  const api = {
    el: scrim,
    isOpen: () => !scrim.hidden,
    open() { scrim.hidden = false; api.update(api.last); },
    close() { scrim.hidden = true; },
    toggle() { if (scrim.hidden) api.open(); else api.close(); },
    last: null,
    update(snap) {
      api.last = snap;
      if (scrim.hidden || !snap) return;
      const levels = snap.levels || {};
      const bag = snap.inv || {};
      inv.innerHTML = Object.keys(ORE_INFO).map((o) =>
        '<span class="cost"><b style="background:' + ORE_INFO[o].color + '"></b>' + (bag[o] || 0) + '</span>').join('');
      for (const n of TREE) {
        const card = cards.get(n.id);
        const lv = levels[n.id] || 0;
        const maxed = lv >= n.levels;
        const locked = (n.requires || []).some((r) => !(levels[r] > 0));
        const cost = maxed ? null : (n.cost && n.cost[lv]) || {};
        card.classList.toggle('locked', locked);
        card.classList.toggle('maxed', maxed);
        card.querySelector('.node-lv').textContent = lv + '/' + n.levels;
        const costs = card.querySelector('.node-costs');
        let afford = true;
        if (!cost) costs.innerHTML = '';
        else {
          costs.innerHTML = Object.entries(cost).map(([o, v]) => {
            const ok = (bag[o] || 0) >= v;
            if (!ok) afford = false;
            return '<span class="cost' + (ok ? '' : ' no') + '"><b style="background:' +
              ((ORE_INFO[o] && ORE_INFO[o].color) || '#888') + '"></b>' + v + '</span>';
          }).join('');
        }
        const buy = card.querySelector('.node-buy');
        buy.disabled = maxed || locked || !afford;
        buy.textContent = maxed ? 'Max' : locked ? 'Locked' : 'Buy';
      }
    },
  };
  return api;
}
