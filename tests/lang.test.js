// Zero-dependency test suite for js/lang. Run with: node tests/lang.test.js

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(name + (extra ? ` -> ${extra}` : ''));
  }
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  ok(name, a === b, `got ${a}, want ${b}`);
}

function makeApi(overrides = {}) {
  const log = [];
  const api = {
    log,
    print: (t) => log.push(t),
    can_mine: () => true,
    get_ore: () => 'stone',
    scan: () => 'rock',
    get_pos_x: () => 2,
    get_pos_y: () => 3,
    get_world_size: () => 4,
    count: () => 7,
  };
  return Object.assign(api, overrides);
}

async function main() {
  const lang = await import('../js/lang/index.js');
  const { compile, createRun, createRunFromFunction, tokenize, KEYWORDS, BUILTINS, LangError } = lang;

  function run(src, api, opts) {
    const out = compile(src, opts || {});
    if (out.errors.length) throw new Error(`compile failed: ${out.errors[0].message}`);
    const runner = createRun(out.program, api || makeApi());
    const yields = [];
    let value;
    for (let i = 0; i < 20000; i++) {
      const r = runner.step(value);
      value = undefined;
      if (r.done) return { yields, runner };
      yields.push(r.yield);
    }
    throw new Error('program did not finish in 20000 steps');
  }

  function printsOf(src, opts) {
    const api = makeApi();
    run(src, api, opts);
    return api.log;
  }

  function firstError(src, opts) {
    const out = compile(src, opts || {});
    return out.errors[0] || null;
  }

  function runtimeError(src, api) {
    try {
      run(src, api);
    } catch (e) {
      return e;
    }
    return null;
  }

  // --- surface ---
  ok('exports compile', typeof compile === 'function');
  ok('exports createRun', typeof createRun === 'function');
  ok('exports tokenize', typeof tokenize === 'function');
  ok('KEYWORDS has repeat', KEYWORDS.includes('repeat'));
  ok('BUILTINS has spawn_drone', BUILTINS.includes('spawn_drone'));

  // --- tokenizer ---
  const toks = tokenize('x = 1  # hi\nprint(x)\n');
  ok('tokenizer emits comment token', toks.some((t) => t.type === 'comment' && t.value === '# hi'));
  ok('tokenizer marks names', toks.some((t) => t.type === 'name' && t.value === 'x'));
  ok('tokenizer positions', toks[0].line === 1 && toks[0].col === 1);
  const toks2 = tokenize('if True:\n\tmine()\n');
  ok('tokenizer emits indent', toks2.some((t) => t.type === 'indent'));
  ok('tokenizer emits dedent', toks2.some((t) => t.type === 'dedent'));
  ok('tokenizer ends with eof', toks2[toks2.length - 1].type === 'eof');
  ok('tokenizer keeps floats', tokenize('1.5').some((t) => t.type === 'num' && t.value === 1.5));

  // --- literals and printing ---
  eq('print number', printsOf('print(3)'), ['3']);
  eq('print booleans', printsOf('print(True)\nprint(False)'), ['True', 'False']);
  eq('print None', printsOf('print(None)'), ['None']);
  eq('print list', printsOf('print([1, 2])'), ['[1, 2]']);
  eq('print nested strings', printsOf('print(["a"])'), ["['a']"]);
  eq('print dict', printsOf('print({"a": 1})'), ["{'a': 1}"]);
  eq('print string bare', printsOf("print('hi')"), ['hi']);

  // --- arithmetic ---
  eq('integer division', printsOf('print(7 // 2)'), ['3']);
  eq('true division', printsOf('print(7 / 2)'), ['3.5']);
  eq('modulo', printsOf('print(7 % 3)'), ['1']);
  eq('negative modulo follows divisor', printsOf('print(-1 % 3)'), ['2']);
  eq('precedence', printsOf('print(2 + 3 * 4)'), ['14']);
  eq('parentheses', printsOf('print((2 + 3) * 4)'), ['20']);
  eq('string concat', printsOf('print("a" + "b")'), ['ab']);
  eq('unary minus', printsOf('print(-5 + 1)'), ['-4']);
  eq('comparison and logic', printsOf('print(1 < 2 and not False)'), ['True']);
  eq('or shortcut', printsOf('print(0 or 5)'), ['5']);

  // --- builtins ---
  eq('len list', printsOf('print(len([1, 2, 3]))'), ['3']);
  eq('len string', printsOf('print(len("abcd"))'), ['4']);
  eq('range 1 arg', printsOf('print(range(3))'), ['[0, 1, 2]']);
  eq('range 2 args', printsOf('print(range(2, 5))'), ['[2, 3, 4]']);
  eq('range 3 args', printsOf('print(range(0, 6, 2))'), ['[0, 2, 4]']);
  eq('abs/min/max/str/int', printsOf('print(abs(-3))\nprint(min(4, 2))\nprint(max([1, 9]))\nprint(str(12) + "!")\nprint(int("7") + 1)'), ['3', '2', '9', '12!', '8']);
  eq('in on list', printsOf('print(2 in [1, 2])'), ['True']);
  eq('in on string', printsOf('print("bc" in "abcd")'), ['True']);
  eq('not in', printsOf('print(9 not in [1, 2])'), ['True']);

  // --- indexing ---
  eq('list index', printsOf('a = [10, 20, 30]\nprint(a[1])'), ['20']);
  eq('negative index', printsOf('a = [10, 20, 30]\nprint(a[-1])'), ['30']);
  eq('index assignment', printsOf('a = [1, 2]\na[0] = 9\nprint(a)'), ['[9, 2]']);
  eq('dict index', printsOf('d = {"k": 5}\nprint(d["k"])'), ['5']);
  eq('string index', printsOf('print("abc"[1])'), ['b']);

  // --- statements ---
  eq('if/elif/else', printsOf('x = 2\nif x == 1:\n    print("one")\nelif x == 2:\n    print("two")\nelse:\n    print("other")'), ['two']);
  eq('augmented assignment', printsOf('x = 1\nx += 4\nx *= 2\nx -= 3\nprint(x)'), ['7']);
  eq('while with break', printsOf('i = 0\nwhile True:\n    i += 1\n    if i > 2:\n        break\nprint(i)'), ['3']);
  eq('continue', printsOf('for i in range(4):\n    if i == 1:\n        continue\n    print(i)'), ['0', '2', '3']);
  eq('for over list', printsOf('for x in [1, 2]:\n    print(x)'), ['1', '2']);
  eq('repeat', printsOf('repeat(3):\n    print("x")'), ['x', 'x', 'x']);
  eq('def and return', printsOf('def add(a, b):\n    return a + b\nprint(add(2, 3))'), ['5']);
  eq('recursion', printsOf('def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\nprint(f(5))'), ['120']);
  eq('pass is a no-op', printsOf('if True:\n    pass\nprint(1)'), ['1']);
  eq('comments ignored', printsOf('# top\nprint(1)  # side'), ['1']);

  // --- constants and shadowing ---
  eq('bare direction constant', printsOf('print(right)'), ['right']);
  eq('bare ore constant', printsOf('print(crystal)'), ['crystal']);
  eq('constant can be shadowed', printsOf('up = 5\nprint(up)'), ['5']);

  // --- tolerant indentation ---
  eq('mixed tabs and spaces', printsOf('if True:\n\tprint(1)\n        print(2)'), ['1', '2']);
  eq('uneven deeper indent', printsOf('if True:\n  print(1)\n      print(2)\nprint(3)'), ['1', '2', '3']);
  ok('unclosed block at EOF compiles', compile('repeat(3):').errors.length === 0);
  eq('unclosed block runs as empty', printsOf('print(1)\nrepeat(2):'), ['1']);
  eq('inline suite', printsOf('if True: print(9)'), ['9']);

  // --- sensors are synchronous ---
  const sensorApi = makeApi();
  eq('sensors return immediately', (() => {
    run('print(get_pos_x())\nprint(get_pos_y())\nprint(get_world_size())\nprint(get_ore())\nprint(count(coal))\nprint(scan(up))\nprint(can_mine())', sensorApi);
    return sensorApi.log;
  })(), ['2', '3', '4', 'stone', '7', 'rock', 'True']);

  // --- yields ---
  eq('move yields the documented object', run('move(up)').yields, [{ op: 'move', dir: 'up' }]);
  eq('mine yields', run('mine()').yields, [{ op: 'mine' }]);
  eq('place yields', run('place(coal)').yields, [{ op: 'place', ore: 'coal' }]);
  eq('wait yields ms', run('wait(0.5)').yields, [{ op: 'wait', ms: 500 }]);
  eq('loop yields a tick each iteration', run('repeat(2):\n    mine()').yields, [
    { op: 'tick' }, { op: 'mine' }, { op: 'tick' }, { op: 'mine' },
  ]);
  eq('function call yields a tick', run('def f():\n    mine()\nf()').yields, [{ op: 'tick' }, { op: 'mine' }]);
  eq('while loop yields ticks', run('i = 0\nwhile i < 2:\n    i += 1').yields, [
    { op: 'tick' }, { op: 'tick' }, { op: 'tick' },
  ]);

  // --- host resumes with a value ---
  {
    const api = makeApi();
    const out = compile('if move(right):\n    print("moved")\nelse:\n    print("blocked")');
    const runner = createRun(out.program, api);
    const first = runner.step();
    eq('move yield before resume', first.yield, { op: 'move', dir: 'right' });
    const second = runner.step(false);
    ok('program finished after resume', second.done === true);
    eq('move returned the host value', api.log, ['blocked']);
  }
  {
    const api = makeApi();
    const out = compile('x = mine()\nprint(x)');
    const runner = createRun(out.program, api);
    runner.step();
    runner.step(true);
    eq('mine returns True from host', api.log, ['True']);
  }

  // --- the full drone program ---
  {
    const src = 'repeat(3):\n    if can_mine():\n        mine()\n    move(right)\n';
    let calls = 0;
    const api = makeApi({ can_mine: () => { calls++; return calls !== 2; } });
    const out = compile(src);
    ok('drone program compiles', out.errors.length === 0);
    const runner = createRun(out.program, api);
    const seq = [];
    let value;
    let guard = 0;
    for (;;) {
      const r = runner.step(value);
      value = undefined;
      if (r.done) break;
      seq.push(r.yield);
      if (r.yield.op === 'move' || r.yield.op === 'mine') value = true;
      if (guard++ > 200) throw new Error('runaway');
    }
    eq('exact yield sequence of the drone program', seq, [
      { op: 'tick' }, { op: 'mine' }, { op: 'move', dir: 'right' },
      { op: 'tick' }, { op: 'move', dir: 'right' },
      { op: 'tick' }, { op: 'mine' }, { op: 'move', dir: 'right' },
    ]);
    ok('can_mine called three times', calls === 3, `calls=${calls}`);
    ok('runner reports done', runner.done === true);
  }

  // --- infinite loop never hangs ---
  {
    const out = compile('while True:\n    pass');
    const runner = createRun(out.program, makeApi());
    let ticks = 0;
    let done = false;
    for (let i = 0; i < 1000; i++) {
      const r = runner.step();
      if (r.done) { done = true; break; }
      if (r.yield.op === 'tick') ticks++;
    }
    ok('infinite loop yields ticks', ticks === 1000, `ticks=${ticks}`);
    ok('infinite loop never finishes', done === false);
  }

  // --- spawn_drone ---
  {
    const api = makeApi();
    const out = compile('def worker():\n    mine()\n    move(left)\nspawn_drone(worker)');
    const runner = createRun(out.program, api);
    const r = runner.step();
    ok('spawn yields op spawn', r.yield.op === 'spawn');
    ok('spawn carries a callable', !!r.yield.fn && typeof r.yield.fn === 'object');
    const child = createRunFromFunction(r.yield.fn, api);
    const childSeq = [];
    let v;
    for (let i = 0; i < 20; i++) {
      const cr = child.step(v);
      v = true;
      if (cr.done) break;
      childSeq.push(cr.yield);
    }
    eq('spawned function runs in a fresh runner', childSeq, [
      { op: 'tick' }, { op: 'mine' }, { op: 'move', dir: 'left' },
    ]);
  }

  // --- compile errors ---
  {
    const e = firstError('move(up');
    ok('missing paren is an error', !!e);
    ok('missing paren message', e && e.message === 'Line 1: missing ")"', e && e.message);
    ok('error carries line and col', e && e.line === 1 && typeof e.col === 'number');
  }
  {
    const e = firstError('mvoe(up)');
    ok('typo suggests move', e && e.message === 'Line 1: "mvoe" is not a command. Did you mean "move"?', e && e.message);
  }
  {
    const e = firstError('print("hi)');
    ok('unterminated string is an error', !!e && /missing closing/.test(e.message));
  }
  {
    const e = firstError('x = 1\nprint(zzzzzzz)');
    ok('unknown name without suggestion', e && e.message === 'Line 2: "zzzzzzz" is not a command.', e && e.message);
  }
  {
    const e = firstError('1 = 2');
    ok('bad assignment target', !!e);
  }
  {
    const e = firstError('print(1 +)');
    ok('incomplete expression', !!e);
  }

  // --- gating ---
  {
    const allowed = new Set(['move', 'mine']);
    const e = firstError('repeat(2):\n    mine()', { allowed });
    ok('repeat is gated', e && e.message === 'Line 1: "repeat" is locked. Unlock it in the tree.', e && e.message);
  }
  {
    const allowed = new Set(['move', 'mine', 'repeat']);
    const e = firstError('repeat(2):\n    place(coal)', { allowed });
    ok('place is gated', e && e.raw === '"place" is locked. Unlock it in the tree.', e && e.message);
    ok('gated error line points at place', e && e.line === 2, e && String(e.line));
  }
  {
    const allowed = new Set(['move', 'mine', 'repeat']);
    ok('allowed program compiles clean', compile('repeat(2):\n    mine()\n    move(up)', { allowed }).errors.length === 0);
  }
  {
    const allowed = new Set(['print']);
    ok('list literal is gated', firstError('print([1])', { allowed }).raw === '"list" is locked. Unlock it in the tree.');
    ok('dict literal is gated', firstError('print({1: 2})', { allowed }).raw === '"dict" is locked. Unlock it in the tree.');
    ok('if is gated', firstError('if True:\n    print(1)', { allowed }).raw === '"if" is locked. Unlock it in the tree.');
    ok('def is gated', firstError('def f():\n    print(1)', { allowed }).raw === '"def" is locked. Unlock it in the tree.');
    ok('for is gated', firstError('for i in [1]:\n    print(i)', { allowed }).raw !== undefined);
    ok('while is gated', firstError('while True:\n    print(1)', { allowed }).raw === '"while" is locked. Unlock it in the tree.');
  }
  ok('no allowed set means nothing is locked', compile('repeat(1):\n    place(gold)').errors.length === 0);

  // --- runtime errors ---
  {
    const e = runtimeError('print(1 / 0)');
    ok('divide by zero is a runtime error', e instanceof LangError, String(e));
    ok('divide by zero message', e && e.raw === 'I cannot divide by zero.', e && e.message);
  }
  {
    const e = runtimeError('a = [1]\nprint(a[5])');
    ok('index out of range is friendly', e instanceof LangError && e.line === 2, e && e.message);
  }
  {
    const e = runtimeError('move("sideways")');
    ok('bad direction is friendly', e instanceof LangError && /direction/.test(e.raw), e && e.message);
  }
  {
    const e = runtimeError('def f():\n    return f()\nf()');
    ok('deep recursion is friendly, not a stack overflow', e instanceof LangError && /too many functions/.test(e.raw), e && e.message);
  }
  {
    const e = runtimeError('print("a" + 1)');
    ok('adding text and number is friendly', e instanceof LangError && /cannot add/.test(e.raw), e && e.message);
  }
  {
    const e = runtimeError('scan(up)', { print: () => {} });
    ok('missing api method is friendly', e instanceof LangError && /not available/.test(e.raw), e && e.message);
  }
  {
    const e = runtimeError('def f(a):\n    return a\nprint(f())');
    ok('wrong argument count is friendly', e instanceof LangError && /needs 1 thing/.test(e.raw), e && e.message);
  }

  // --- runner line tracking ---
  {
    const out = compile('print(1)\nmine()\nprint(2)');
    const runner = createRun(out.program, makeApi());
    const r = runner.step();
    ok('runner reports the executing line', runner.line === 2 && r.yield.op === 'mine', `line=${runner.line}`);
  }

  console.log(`${passed} passed, ${failed} failed`);
  if (failed) {
    for (const f of failures) console.log('FAIL: ' + f);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
