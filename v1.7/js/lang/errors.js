// Error type and child-friendly message helpers for the Hello, Miner language.

export class LangError extends Error {
  constructor(raw, line, col) {
    const l = typeof line === 'number' && line > 0 ? line : 1;
    const c = typeof col === 'number' && col > 0 ? col : 1;
    super(`Line ${l}: ${raw}`);
    this.name = 'LangError';
    this.raw = raw;
    this.line = l;
    this.col = c;
  }
  toJSON() {
    return { line: this.line, col: this.col, message: this.message, raw: this.raw };
  }
}

export function editDistance(a, b) {
  a = String(a);
  b = String(b);
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[n];
}

export function suggest(name, known, maxDistance = 2) {
  let best = null;
  let bestScore = Infinity;
  const lower = String(name).toLowerCase();
  for (const candidate of known) {
    if (candidate === name) continue;
    let d = editDistance(lower, String(candidate).toLowerCase());
    if (d > maxDistance) continue;
    if (d < bestScore || (d === bestScore && best !== null && candidate.length < best.length)) {
      best = candidate;
      bestScore = d;
    }
  }
  return best;
}

export function unknownNameMessage(name, known) {
  const hit = suggest(name, known);
  if (hit) return `"${name}" is not a command. Did you mean "${hit}"?`;
  return `"${name}" is not a command.`;
}

export function lockedMessage(name) {
  return `"${name}" is locked. Unlock it in the tree.`;
}
