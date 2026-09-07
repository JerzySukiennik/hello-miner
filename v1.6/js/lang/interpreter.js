// Generator-based interpreter: every loop/call yields a tick; caps are 10000 list items, 10000 text letters, 10000 dict keys, 100000 range steps, 100 call depth, so no single statement can block the 50 ms sim tick.

import { LangError, unknownNameMessage } from './errors.js';
import { BUILTINS, CONSTANTS } from './parser.js';

const BUILTIN_SET = new Set(BUILTINS);
const CONSTANT_SET = new Set(CONSTANTS);
const DIR_NAMES = new Set(['up', 'down', 'left', 'right']);
const ORE_NAMES = new Set(['stone', 'coal', 'iron', 'gold', 'crystal', 'none']);
const MAX_RANGE = 100000;
const MAX_LIST = 10000;
const MAX_TEXT = 10000;
const MAX_DICT = 10000;
const DEFAULT_MAX_DEPTH = 100;

const tooBigList = (node) => err(`that list would be too big (max ${MAX_LIST} items)`, node);
const tooBigText = (node) => err(`that text would be too long (max ${MAX_TEXT} letters)`, node);
const tooBigDict = (node) => err(`that dict would be too big (max ${MAX_DICT} keys)`, node);

const BREAK = { signal: 'break' };
const CONTINUE = { signal: 'continue' };

class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

class Env {
  constructor(parent) {
    this.vars = new Map();
    this.parent = parent || null;
  }
  lookup(name) {
    let env = this;
    while (env) {
      if (env.vars.has(name)) return { found: true, value: env.vars.get(name) };
      env = env.parent;
    }
    return { found: false, value: null };
  }
  set(name, value) {
    let env = this;
    while (env) {
      if (env.vars.has(name)) {
        env.vars.set(name, value);
        return;
      }
      env = env.parent;
    }
    this.vars.set(name, value);
  }
  define(name, value) {
    this.vars.set(name, value);
  }
}

export function isFunctionValue(v) {
  return !!v && typeof v === 'object' && (v.__lang === 'function' || v.__lang === 'builtin');
}

function isList(v) {
  return Array.isArray(v);
}

function isDict(v) {
  return v instanceof Map;
}

function isPrimitiveKey(v) {
  const t = typeof v;
  return v === null || t === 'number' || t === 'string' || t === 'boolean';
}

export function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (isList(v)) return v.length > 0;
  if (isDict(v)) return v.size > 0;
  return true;
}

export function repr(v, top = false) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'nan';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    return String(v);
  }
  if (typeof v === 'string') return top ? v : `'${v}'`;
  if (isList(v)) return `[${v.map((x) => repr(x, false)).join(', ')}]`;
  if (isDict(v)) {
    const parts = [];
    for (const [k, val] of v) parts.push(`${repr(k, false)}: ${repr(val, false)}`);
    return `{${parts.join(', ')}}`;
  }
  if (isFunctionValue(v)) return `<function ${v.name}>`;
  return String(v);
}

export function equals(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (isList(a) && isList(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equals(a[i], b[i])) return false;
    return true;
  }
  if (isDict(a) && isDict(b)) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k)) return false;
      if (!equals(v, b.get(k))) return false;
    }
    return true;
  }
  return false;
}

function typeName(v) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return 'a True/False value';
  if (typeof v === 'number') return 'a number';
  if (typeof v === 'string') return 'some text';
  if (isList(v)) return 'a list';
  if (isDict(v)) return 'a dict';
  if (isFunctionValue(v)) return 'a function';
  return 'a thing';
}

function err(raw, node) {
  return new LangError(raw, node && node.line, node && node.col);
}

function num(v, node, what) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw err(`${what} needs a number, not ${typeName(v)}.`, node);
}

function binary(op, a, b, node) {
  switch (op) {
    case '+':
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (typeof a === 'string' && typeof b === 'string') {
        if (a.length + b.length > MAX_TEXT) throw tooBigText(node);
        return a + b;
      }
      if (isList(a) && isList(b)) {
        if (a.length + b.length > MAX_LIST) throw tooBigList(node);
        return a.concat(b);
      }
      throw err(`I cannot add ${typeName(a)} and ${typeName(b)}.`, node);
    case '-':
      return num(a, node, '"-"') - num(b, node, '"-"');
    case '*': {
      const text = typeof a === 'string' ? a : typeof b === 'string' ? b : null;
      if (text !== null && (typeof a === 'number' || typeof b === 'number')) {
        const times = Math.max(0, Math.trunc(typeof a === 'number' ? a : b));
        if (text.length * times > MAX_TEXT) throw tooBigText(node);
        return text.repeat(times);
      }
      const list = isList(a) ? a : isList(b) ? b : null;
      if (list !== null && (typeof a === 'number' || typeof b === 'number')) {
        const times = Math.max(0, Math.trunc(typeof a === 'number' ? a : b));
        if (list.length * times > MAX_LIST) throw tooBigList(node);
        const out = [];
        for (let i = 0; i < times; i++) out.push(...list);
        return out;
      }
      return num(a, node, '"*"') * num(b, node, '"*"');
    }
    case '/': {
      const d = num(b, node, '"/"');
      if (d === 0) throw err('I cannot divide by zero.', node);
      return num(a, node, '"/"') / d;
    }
    case '//': {
      const d = num(b, node, '"//"');
      if (d === 0) throw err('I cannot divide by zero.', node);
      return Math.floor(num(a, node, '"//"') / d);
    }
    case '%': {
      const d = num(b, node, '"%"');
      if (d === 0) throw err('I cannot divide by zero.', node);
      const x = num(a, node, '"%"');
      return ((x % d) + d) % d;
    }
    case '==':
      return equals(a, b);
    case '!=':
      return !equals(a, b);
    case '<':
    case '<=':
    case '>':
    case '>=': {
      let x = a;
      let y = b;
      if (typeof x === 'boolean') x = x ? 1 : 0;
      if (typeof y === 'boolean') y = y ? 1 : 0;
      const okNum = typeof x === 'number' && typeof y === 'number';
      const okStr = typeof x === 'string' && typeof y === 'string';
      if (!okNum && !okStr) throw err(`I cannot compare ${typeName(a)} with ${typeName(b)}.`, node);
      if (op === '<') return x < y;
      if (op === '<=') return x <= y;
      if (op === '>') return x > y;
      return x >= y;
    }
    case 'in':
      if (isList(b)) return b.some((x) => equals(x, a));
      if (typeof b === 'string') {
        if (typeof a !== 'string') throw err('I can only look for text inside text.', node);
        return b.indexOf(a) !== -1;
      }
      if (isDict(b)) {
        if (isPrimitiveKey(a)) return b.has(a);
        for (const k of b.keys()) if (equals(k, a)) return true;
        return false;
      }
      throw err(`I cannot look inside ${typeName(b)}.`, node);
    default:
      throw err(`I do not know the operator "${op}".`, node);
  }
}

function getIndex(obj, key, node) {
  if (isList(obj) || typeof obj === 'string') {
    const n = obj.length;
    let i = key;
    if (typeof i === 'boolean') i = i ? 1 : 0;
    if (typeof i !== 'number') throw err(`I need a number inside [ ], not ${typeName(key)}.`, node);
    i = Math.trunc(i);
    if (i < 0) i += n;
    if (i < 0 || i >= n) {
      const what = typeof obj === 'string' ? 'That text' : 'That list';
      throw err(`${what} has ${n} things, so ${repr(key)} is out of reach.`, node);
    }
    return typeof obj === 'string' ? obj[i] : obj[i];
  }
  if (isDict(obj)) {
    if (isPrimitiveKey(key)) {
      if (obj.has(key)) return obj.get(key);
      throw err(`That dict has no key ${repr(key)}.`, node);
    }
    for (const [k, v] of obj) if (equals(k, key)) return v;
    throw err(`That dict has no key ${repr(key)}.`, node);
  }
  throw err(`I cannot use [ ] on ${typeName(obj)}.`, node);
}

function setIndex(obj, key, value, node) {
  if (isList(obj)) {
    let i = key;
    if (typeof i !== 'number') throw err(`I need a number inside [ ], not ${typeName(key)}.`, node);
    i = Math.trunc(i);
    if (i < 0) i += obj.length;
    if (i < 0 || i >= obj.length) throw err(`That list has ${obj.length} things, so ${repr(key)} is out of reach.`, node);
    obj[i] = value;
    return;
  }
  if (isDict(obj)) {
    if (isPrimitiveKey(key)) {
      if (!obj.has(key) && obj.size >= MAX_DICT) throw tooBigDict(node);
      obj.set(key, value);
      return;
    }
    for (const k of obj.keys()) {
      if (equals(k, key)) {
        obj.set(k, value);
        return;
      }
    }
    if (obj.size >= MAX_DICT) throw tooBigDict(node);
    obj.set(key, value);
    return;
  }
  throw err(`I cannot use [ ] on ${typeName(obj)}.`, node);
}

function makeRange(args, node) {
  let start = 0;
  let stop = 0;
  let step = 1;
  if (args.length === 1) stop = num(args[0], node, 'range');
  else if (args.length === 2) {
    start = num(args[0], node, 'range');
    stop = num(args[1], node, 'range');
  } else if (args.length === 3) {
    start = num(args[0], node, 'range');
    stop = num(args[1], node, 'range');
    step = num(args[2], node, 'range');
  } else {
    throw err('range needs 1, 2 or 3 numbers.', node);
  }
  if (step === 0) throw err('range cannot step by zero.', node);
  const out = [];
  start = Math.trunc(start);
  stop = Math.trunc(stop);
  step = Math.trunc(step);
  if (step > 0) {
    for (let i = start; i < stop; i += step) {
      out.push(i);
      if (out.length > MAX_RANGE) throw err('that range is too big for me.', node);
    }
  } else {
    for (let i = start; i > stop; i += step) {
      out.push(i);
      if (out.length > MAX_RANGE) throw err('that range is too big for me.', node);
    }
  }
  return out;
}

function toInt(v, node) {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t !== '' && !Number.isNaN(Number(t))) return Math.trunc(Number(t));
    throw err(`I cannot turn "${v}" into a number.`, node);
  }
  throw err(`I cannot turn ${typeName(v)} into a number.`, node);
}

function lengthOf(v, node) {
  if (typeof v === 'string') return v.length;
  if (isList(v)) return v.length;
  if (isDict(v)) return v.size;
  throw err(`I cannot measure ${typeName(v)}.`, node);
}

function pickMinMax(name, args, node) {
  let values = args;
  if (args.length === 1 && isList(args[0])) values = args[0];
  if (values.length === 0) throw err(`${name} needs at least one thing.`, node);
  let best = values[0];
  for (const v of values) {
    const cmp = binary(name === 'min' ? '<' : '>', v, best, node);
    if (cmp === true) best = v;
  }
  return best;
}

function wantArgs(name, args, count, node) {
  if (args.length !== count) {
    const thing = count === 1 ? '1 thing' : `${count} things`;
    throw err(`${name} needs ${thing} inside ( ).`, node);
  }
}

function toDir(v, node) {
  if (typeof v === 'string' && DIR_NAMES.has(v)) return v;
  throw err('I need a direction: up, down, left or right.', node);
}

function toOre(v, node) {
  if (typeof v === 'string' && ORE_NAMES.has(v)) return v;
  throw err('I need an ore: stone, coal, iron, gold, crystal or none.', node);
}

function apiCall(ctx, name, args, node) {
  const fn = ctx.api ? ctx.api[name] : null;
  if (typeof fn !== 'function') throw err(`"${name}" is not available right now.`, node);
  const out = fn.apply(ctx.api, args);
  return out === undefined ? null : out;
}

function* callBuiltin(name, args, node, ctx) {
  switch (name) {
    case 'move': {
      wantArgs('move', args, 1, node);
      const dir = toDir(args[0], node);
      const r = yield { op: 'move', dir };
      return r === undefined ? null : r;
    }
    case 'mine': {
      wantArgs('mine', args, 0, node);
      const r = yield { op: 'mine' };
      return r === undefined ? null : r;
    }
    case 'place': {
      wantArgs('place', args, 1, node);
      const ore = toOre(args[0], node);
      const r = yield { op: 'place', ore };
      return r === undefined ? null : r;
    }
    case 'wait': {
      wantArgs('wait', args, 1, node);
      const seconds = num(args[0], node, 'wait');
      const r = yield { op: 'wait', ms: Math.max(0, Math.round(seconds * 1000)) };
      return r === undefined ? null : r;
    }
    case 'spawn_drone': {
      wantArgs('spawn_drone', args, 1, node);
      if (!isFunctionValue(args[0])) throw err('spawn_drone needs the name of a function.', node);
      const r = yield { op: 'spawn', fn: args[0] };
      return r === undefined ? null : r;
    }
    case 'can_mine':
      wantArgs('can_mine', args, 0, node);
      return !!apiCall(ctx, 'can_mine', [], node);
    case 'get_ore':
      wantArgs('get_ore', args, 0, node);
      return apiCall(ctx, 'get_ore', [], node);
    case 'scan':
      wantArgs('scan', args, 1, node);
      return apiCall(ctx, 'scan', [toDir(args[0], node)], node);
    case 'get_pos_x':
      wantArgs('get_pos_x', args, 0, node);
      return apiCall(ctx, 'get_pos_x', [], node);
    case 'get_pos_y':
      wantArgs('get_pos_y', args, 0, node);
      return apiCall(ctx, 'get_pos_y', [], node);
    case 'get_world_size':
      wantArgs('get_world_size', args, 0, node);
      return apiCall(ctx, 'get_world_size', [], node);
    case 'count':
      wantArgs('count', args, 1, node);
      return apiCall(ctx, 'count', [toOre(args[0], node)], node);
    case 'print': {
      wantArgs('print', args, 1, node);
      apiCall(ctx, 'print', [repr(args[0], true)], node);
      return null;
    }
    case 'len':
      wantArgs('len', args, 1, node);
      return lengthOf(args[0], node);
    case 'enumerate': {
      const src = args[0];
      let list;
      if (isList(src)) list = src;
      else if (typeof src === 'string') list = Array.from(src);
      else if (isDict(src)) list = Array.from(src.keys());
      else throw err(`enumerate needs a list, but got ${typeName(src)}.`, node);
      const start = args.length > 1 ? Math.trunc(num(args[1], node, 'enumerate')) : 0;
      return list.map((v, i) => [i + start, v]);
    }
    case 'range':
      return makeRange(args, node);
    case 'str':
      wantArgs('str', args, 1, node);
      return repr(args[0], true);
    case 'int':
      wantArgs('int', args, 1, node);
      return toInt(args[0], node);
    case 'abs':
      wantArgs('abs', args, 1, node);
      return Math.abs(num(args[0], node, 'abs'));
    case 'min':
    case 'max':
      return pickMinMax(name, args, node);
    default:
      throw err(`"${name}" is not a command.`, node);
  }
}

function* callValue(fnVal, args, ctx, node) {
  if (fnVal && fnVal.__lang === 'builtin') {
    return yield* callBuiltin(fnVal.name, args, node, ctx);
  }
  if (!fnVal || fnVal.__lang !== 'function') {
    throw err(`I cannot run ${typeName(fnVal)} like a command.`, node);
  }
  yield { op: 'tick' };
  ctx.depth++;
  if (ctx.depth > ctx.maxDepth) {
    ctx.depth--;
    throw err('too many functions called inside each other. Did a function call itself forever?', node);
  }
  const env = new Env(fnVal.closure);
  if (args.length !== fnVal.params.length) {
    ctx.depth--;
    const need = fnVal.params.length;
    throw err(`${fnVal.name} needs ${need} ${need === 1 ? 'thing' : 'things'} inside ( ), but got ${args.length}.`, node);
  }
  for (let i = 0; i < fnVal.params.length; i++) env.define(fnVal.params[i], args[i]);
  try {
    yield* execBlock(fnVal.body, env, ctx);
  } catch (e) {
    if (e instanceof ReturnSignal) {
      ctx.depth--;
      return e.value;
    }
    ctx.depth--;
    if (e === BREAK || e === CONTINUE) return null;
    throw e;
  }
  ctx.depth--;
  return null;
}


function methodError(name, node) {
  return new LangError(node.line, node.col, `there is no "${name}" you can use with a dot here`);
}

function makeMethod(obj, name, node) {
  if (Array.isArray(obj)) {
    if (name === 'append') return { __method: (args) => {
      if (obj.length + 1 > MAX_LIST) throw new LangError(node.line, node.col, `that list would be too big (max ${MAX_LIST} items)`);
      obj.push(args[0] === undefined ? null : args[0]);
      return null;
    } };
    if (name === 'pop') return { __method: () => (obj.length ? obj.pop() : null) };
    if (name === 'clear') return { __method: () => { obj.length = 0; return null; } };
    if (name === 'count') return { __method: (args) => obj.filter((v) => equals(v, args[0])).length };
    if (name === 'index') return { __method: (args) => {
      const i = obj.findIndex((v) => equals(v, args[0]));
      if (i < 0) throw new LangError(node.line, node.col, 'that value is not in the list');
      return i;
    } };
    if (name === 'reverse') return { __method: () => { obj.reverse(); return null; } };
    throw methodError(name, node);
  }
  if (typeof obj === 'string') {
    if (name === 'upper') return { __method: () => obj.toUpperCase() };
    if (name === 'lower') return { __method: () => obj.toLowerCase() };
    if (name === 'strip') return { __method: () => obj.trim() };
    if (name === 'startswith') return { __method: (args) => obj.startsWith(String(args[0])) };
    if (name === 'endswith') return { __method: (args) => obj.endsWith(String(args[0])) };
    if (name === 'replace') return { __method: (args) => {
      const out = obj.split(String(args[0])).join(String(args[1]));
      if (out.length > MAX_TEXT) throw new LangError(node.line, node.col, `that text would be too long (max ${MAX_TEXT} letters)`);
      return out;
    } };
    throw methodError(name, node);
  }
  if (obj instanceof Map) {
    if (name === 'keys') return { __method: () => [...obj.keys()] };
    if (name === 'values') return { __method: () => [...obj.values()] };
    if (name === 'get') return { __method: (args) => (obj.has(args[0]) ? obj.get(args[0]) : (args.length > 1 ? args[1] : null)) };
    throw methodError(name, node);
  }
  throw methodError(name, node);
}

function* evalExpr(node, env, ctx) {
  switch (node.type) {
    case 'Num':
    case 'Str':
    case 'Bool':
      return node.value;
    case 'NoneLit':
      return null;
    case 'Name': {
      const hit = env.lookup(node.name);
      if (hit.found) return hit.value;
      if (CONSTANT_SET.has(node.name)) return node.name;
      if (BUILTIN_SET.has(node.name)) return { __lang: 'builtin', name: node.name };
      const known = new Set([...BUILTINS, ...CONSTANTS]);
      throw err(unknownNameMessage(node.name, known), node);
    }
    case 'List': {
      if (node.items.length > MAX_LIST) throw tooBigList(node);
      const out = [];
      for (const item of node.items) out.push(yield* evalExpr(item, env, ctx));
      return out;
    }
    case 'Dict': {
      if (node.pairs.length > MAX_DICT) throw tooBigDict(node);
      const m = new Map();
      for (const [k, v] of node.pairs) {
        const key = yield* evalExpr(k, env, ctx);
        const val = yield* evalExpr(v, env, ctx);
        m.set(key, val);
      }
      return m;
    }
    case 'Index': {
      const obj = yield* evalExpr(node.obj, env, ctx);
      const key = yield* evalExpr(node.index, env, ctx);
      return getIndex(obj, key, node);
    }
    case 'Slice': {
      const obj = yield* evalExpr(node.obj, env, ctx);
      const from = node.from ? num(yield* evalExpr(node.from, env, ctx), node, 'a slice') : null;
      const to = node.to ? num(yield* evalExpr(node.to, env, ctx), node, 'a slice') : null;
      if (typeof obj === 'string' || Array.isArray(obj)) {
        const len = obj.length;
        const norm = (v, dflt) => {
          if (v === null) return dflt;
          const i = Math.trunc(v);
          return i < 0 ? Math.max(0, len + i) : Math.min(len, i);
        };
        return obj.slice(norm(from, 0), norm(to, len));
      }
      throw new LangError(node.line, node.col, 'only a list or some text can be sliced with [a:b]');
    }
    case 'FString': {
      let out = '';
      for (const part of node.parts) {
        const v = yield* evalExpr(part, env, ctx);
        out += part.type === 'Str' ? String(v) : repr(v, true);
        if (out.length > MAX_TEXT) throw tooBigText(node);
      }
      return out;
    }
    case 'Attr': {
      const obj = yield* evalExpr(node.obj, env, ctx);
      return makeMethod(obj, node.name, node);
    }
    case 'Unary': {
      const v = yield* evalExpr(node.operand, env, ctx);
      if (node.op === 'not') return !truthy(v);
      if (node.op === '-') return -num(v, node, '"-"');
      return num(v, node, '"+"');
    }
    case 'Logic': {
      const left = yield* evalExpr(node.left, env, ctx);
      if (node.op === 'and') {
        if (!truthy(left)) return left;
        return yield* evalExpr(node.right, env, ctx);
      }
      if (truthy(left)) return left;
      return yield* evalExpr(node.right, env, ctx);
    }
    case 'Bin': {
      const a = yield* evalExpr(node.left, env, ctx);
      const b = yield* evalExpr(node.right, env, ctx);
      return binary(node.op, a, b, node);
    }
    case 'Call': {
      const args = [];
      for (const a of node.args) args.push(yield* evalExpr(a, env, ctx));
      if (node.callee.type === 'Name') {
        const name = node.callee.name;
        const hit = env.lookup(name);
        if (!hit.found) {
          if (BUILTIN_SET.has(name)) return yield* callBuiltin(name, args, node, ctx);
          if (CONSTANT_SET.has(name)) throw err(`"${name}" is not a command.`, node);
          const known = new Set([...BUILTINS, ...CONSTANTS]);
          throw err(unknownNameMessage(name, known), node);
        }
        return yield* callValue(hit.value, args, ctx, node);
      }
      const fnVal = yield* evalExpr(node.callee, env, ctx);
      if (fnVal && typeof fnVal === 'object' && typeof fnVal.__method === 'function') return fnVal.__method(args);
      return yield* callValue(fnVal, args, ctx, node);
    }
    default:
      throw err('I do not understand this expression.', node);
  }
}

function* execBlock(stmts, env, ctx) {
  for (const st of stmts) yield* execStmt(st, env, ctx);
}

function* execStmt(node, env, ctx) {
  ctx.line = node.line;
  ctx.col = node.col;
  switch (node.type) {
    case 'ExprStmt':
      yield* evalExpr(node.expr, env, ctx);
      return;
    case 'Assign': {
      let value = yield* evalExpr(node.value, env, ctx);
      if (node.target.type === 'Name') {
        if (node.op !== '=') {
          const cur = env.lookup(node.target.name);
          if (!cur.found) throw err(`"${node.target.name}" has no value yet.`, node);
          value = binary(node.op[0], cur.value, value, node);
        }
        env.set(node.target.name, value);
        return;
      }
      const obj = yield* evalExpr(node.target.obj, env, ctx);
      const key = yield* evalExpr(node.target.index, env, ctx);
      if (node.op !== '=') value = binary(node.op[0], getIndex(obj, key, node), value, node);
      setIndex(obj, key, value, node);
      return;
    }
    case 'If': {
      const test = yield* evalExpr(node.test, env, ctx);
      if (truthy(test)) yield* execBlock(node.body, env, ctx);
      else yield* execBlock(node.orelse, env, ctx);
      return;
    }
    case 'While':
      for (;;) {
        yield { op: 'tick' };
        ctx.line = node.line;
        const test = yield* evalExpr(node.test, env, ctx);
        if (!truthy(test)) return;
        try {
          yield* execBlock(node.body, env, ctx);
        } catch (e) {
          if (e === BREAK) return;
          if (e !== CONTINUE) throw e;
        }
      }
    case 'Repeat': {
      const count = Math.trunc(num(yield* evalExpr(node.count, env, ctx), node, 'repeat'));
      for (let i = 0; i < count; i++) {
        yield { op: 'tick' };
        ctx.line = node.line;
        try {
          yield* execBlock(node.body, env, ctx);
        } catch (e) {
          if (e === BREAK) return;
          if (e !== CONTINUE) throw e;
        }
      }
      return;
    }
    case 'For': {
      const iterable = yield* evalExpr(node.iter, env, ctx);
      let items;
      if (isList(iterable)) items = iterable.slice();
      else if (typeof iterable === 'string') items = Array.from(iterable);
      else if (isDict(iterable)) items = Array.from(iterable.keys());
      else throw err(`I cannot walk through ${typeName(iterable)}.`, node);
      const targets = node.names && node.names.length > 1 ? node.names : null;
      for (const item of items) {
        yield { op: 'tick' };
        ctx.line = node.line;
        if (targets) {
          if (!isList(item) || item.length !== targets.length) {
            throw err(`I need ${targets.length} values here, but got ${isList(item) ? item.length : 1}.`, node);
          }
          targets.forEach((n, i) => env.set(n, item[i]));
        } else env.set(node.name, item);
        try {
          yield* execBlock(node.body, env, ctx);
        } catch (e) {
          if (e === BREAK) return;
          if (e !== CONTINUE) throw e;
        }
      }
      return;
    }
    case 'Def':
      env.define(node.name, {
        __lang: 'function',
        name: node.name,
        params: node.params,
        body: node.body,
        closure: env,
      });
      return;
    case 'Return':
      throw new ReturnSignal(node.value ? yield* evalExpr(node.value, env, ctx) : null);
    case 'Break':
      throw BREAK;
    case 'Continue':
      throw CONTINUE;
    case 'Pass':
      return;
    default:
      throw err('I do not understand this line.', node);
  }
}

function makeRunner(gen, ctx) {
  let finished = false;
  return {
    get line() {
      return ctx.line;
    },
    get done() {
      return finished;
    },
    step(value) {
      if (finished) return { done: true, yield: null, value: null, line: ctx.line };
      let r;
      try {
        r = gen.next(value);
      } catch (e) {
        finished = true;
        if (e instanceof LangError) throw e;
        if (e instanceof RangeError) throw new LangError('this program went too deep. Try fewer nested calls.', ctx.line, ctx.col);
        throw new LangError(String(e && e.message ? e.message : e), ctx.line, ctx.col);
      }
      if (r.done) {
        finished = true;
        return { done: true, yield: null, value: null, line: ctx.line };
      }
      return { done: false, yield: r.value, value: r.value, line: ctx.line };
    },
    stop() {
      finished = true;
    },
  };
}

function makeContext(api, options) {
  return {
    api: api || {},
    depth: 0,
    maxDepth: (options && options.maxDepth) || DEFAULT_MAX_DEPTH,
    line: 1,
    col: 1,
  };
}

export function createRun(program, api, options = {}) {
  const ctx = makeContext(api, options);
  const globals = new Env(null);
  const body = program && program.body ? program.body : [];
  const gen = (function* run() {
    try {
      yield* execBlock(body, globals, ctx);
    } catch (e) {
      if (e instanceof ReturnSignal || e === BREAK || e === CONTINUE) return;
      throw e;
    }
  })();
  return makeRunner(gen, ctx);
}

export function createRunFromFunction(fnValue, api, options = {}) {
  const ctx = makeContext(api, options);
  const node = { line: 1, col: 1 };
  const gen = (function* run() {
    try {
      yield* callValue(fnValue, [], ctx, node);
    } catch (e) {
      if (e instanceof ReturnSignal || e === BREAK || e === CONTINUE) return;
      throw e;
    }
  })();
  return makeRunner(gen, ctx);
}
