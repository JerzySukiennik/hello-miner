// Every snippet a lesson shows must compile with the unlocks the player owns when that lesson appears.

import assert from 'node:assert/strict';

const { INTRO, LESSONS } = await import('../js/ui/lessons.js');
const lang = await import('../js/lang/index.js');
const { TREE } = await import('../js/sim/index.js');
const { BASE_ALLOWED } = await import('../js/ui/index.js').catch(() => ({ BASE_ALLOWED: null }));

const BASE = BASE_ALLOWED || [
  'True', 'False', 'None', 'and', 'or', 'not', 'in', 'pass', 'break', 'continue',
  'up', 'down', 'left', 'right', 'none', 'stone', 'len', 'str', 'int', 'abs', 'min', 'max',
];

let passed = 0;
let failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.log(`FAIL ${name}${extra ? ' -> ' + extra : ''}`);
}

const byId = new Map(TREE.map((n) => [n.id, n]));

// Unlocks a player owns by the time a given node is bought: the node itself plus everything it requires.
function allowedFor(nodeId) {
  const set = new Set([...BASE, 'move', 'mine']);
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id);
    if (!n) return;
    for (const r of n.requires || []) walk(r);
    for (const u of n.unlocks || []) set.add(u);
  };
  walk(nodeId);
  return set;
}

const startSet = new Set([...BASE, 'move', 'mine']);

for (const code of ['en', 'pl']) {
  INTRO[code].pages.forEach((p, i) => {
    if (!p.code) return;
    const out = lang.compile(p.code, { allowed: startSet });
    ok(`intro ${code} page ${i + 1} runs with only move and mine`, out.errors.length === 0,
      out.errors[0] && out.errors[0].message);
  });
}

for (const [id, entry] of Object.entries(LESSONS)) {
  if (id === 'boulder') continue;
  const allowed = allowedFor(id);
  for (const code of ['en', 'pl']) {
    const l = entry[code];
    ok(`${id} has ${code} text`, !!(l && l.title && l.body));
    if (!l || !l.code) continue;
    const out = lang.compile(l.code, { allowed });
    ok(`${id} ${code} snippet compiles with what that unlock gives`, out.errors.length === 0,
      out.errors[0] && out.errors[0].message);
  }
}

{
  const allowed = new Set([...BASE, 'move', 'mine']);
  for (const code of ['en', 'pl']) {
    const out = lang.compile(LESSONS.boulder[code].code, { allowed });
    ok(`boulder ${code} snippet runs with only move and mine`, out.errors.length === 0,
      out.errors[0] && out.errors[0].message);
  }
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
