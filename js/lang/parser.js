// Parser (tokens to AST) and compile-time name/gating checks for Hello, Miner.

import { LangError, unknownNameMessage, lockedMessage } from './errors.js';
import { KEYWORDS } from './tokenizer.js';

export const BUILTINS = [
  'move', 'mine', 'can_mine', 'place', 'get_ore', 'scan',
  'get_pos_x', 'get_pos_y', 'get_world_size', 'count', 'wait',
  'print', 'spawn_drone', 'len', 'range', 'str', 'int', 'abs', 'min', 'max',
];

export const CONSTANTS = ['up', 'down', 'left', 'right', 'stone', 'coal', 'iron', 'gold', 'crystal', 'none'];

export const GATED_CONSTRUCTS = ['if', 'while', 'repeat', 'for', 'def', 'list', 'dict'];

const BUILTIN_SET = new Set(BUILTINS);
const CONSTANT_SET = new Set(CONSTANTS);
const COMPARE_OPS = new Set(['==', '!=', '<', '<=', '>', '>=']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=']);

class Parser {
  constructor(tokens) {
    this.toks = tokens.filter((t) => t.type !== 'comment');
    this.pos = 0;
  }

  peek(offset = 0) {
    const i = this.pos + offset;
    return i < this.toks.length ? this.toks[i] : this.toks[this.toks.length - 1];
  }

  at(type, value) {
    const t = this.peek();
    if (t.type !== type) return false;
    if (value === undefined) return true;
    return t.value === value;
  }

  next() {
    const t = this.peek();
    if (this.pos < this.toks.length - 1) this.pos++;
    return t;
  }

  fail(raw, tok) {
    const t = tok || this.peek();
    throw new LangError(raw, t.line, t.col);
  }

  expectOp(value, raw) {
    if (!this.at('op', value)) this.fail(raw || `missing "${value}"`);
    return this.next();
  }

  parseProgram() {
    const body = [];
    while (!this.at('eof')) {
      if (this.at('newline') || this.at('indent') || this.at('dedent')) {
        this.next();
        continue;
      }
      body.push(this.parseStatement());
    }
    return { type: 'Program', body, line: 1, col: 1 };
  }

  parseBlockBody() {
    const body = [];
    let extra = 0;
    while (!this.at('eof')) {
      if (this.at('newline')) {
        this.next();
        continue;
      }
      if (this.at('indent')) {
        this.next();
        extra++;
        continue;
      }
      if (this.at('dedent')) {
        this.next();
        if (extra > 0) {
          extra--;
          continue;
        }
        break;
      }
      body.push(this.parseStatement());
    }
    return body;
  }

  parseSuite() {
    this.expectOp(':', 'missing ":"');
    if (this.at('newline')) {
      while (this.at('newline')) this.next();
      if (this.at('indent')) {
        this.next();
        return this.parseBlockBody();
      }
      return [];
    }
    if (this.at('eof') || this.at('dedent')) return [];
    const body = [this.parseStatement(true)];
    while (this.at('op', ';')) {
      this.next();
      if (this.at('newline') || this.at('eof')) break;
      body.push(this.parseStatement(true));
    }
    return body;
  }

  endStatement(inline) {
    if (inline) return;
    if (this.at('newline')) {
      this.next();
      return;
    }
    if (this.at('eof') || this.at('dedent')) return;
    this.fail(`I did not expect "${String(this.peek().value)}" here`);
  }

  parseStatement(inline = false) {
    const t = this.peek();
    if (t.type === 'kw') {
      switch (t.value) {
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'for': return this.parseFor();
        case 'def': return this.parseDef();
        case 'repeat': return this.parseRepeat();
        case 'return': {
          this.next();
          let value = null;
          if (!this.at('newline') && !this.at('eof') && !this.at('dedent') && !this.at('op', ';')) {
            value = this.parseExpr();
          }
          this.endStatement(inline);
          return { type: 'Return', value, line: t.line, col: t.col };
        }
        case 'break':
        case 'continue':
        case 'pass': {
          this.next();
          const kind = t.value === 'break' ? 'Break' : t.value === 'continue' ? 'Continue' : 'Pass';
          this.endStatement(inline);
          return { type: kind, line: t.line, col: t.col };
        }
        case 'elif':
        case 'else':
          this.fail(`"${t.value}" needs an "if" above it`);
          break;
        default:
          break;
      }
    }
    const expr = this.parseExpr();
    if (this.at('op') && ASSIGN_OPS.has(this.peek().value)) {
      const op = this.next().value;
      const value = this.parseExpr();
      if (expr.type !== 'Name' && expr.type !== 'Index') {
        this.fail('I can only store things in a variable', t);
      }
      this.endStatement(inline);
      return { type: 'Assign', target: expr, op, value, line: t.line, col: t.col };
    }
    this.endStatement(inline);
    return { type: 'ExprStmt', expr, line: t.line, col: t.col };
  }

  parseIf() {
    const t = this.next();
    const test = this.parseExpr();
    const body = this.parseSuite();
    let orelse = [];
    if (this.at('kw', 'elif')) {
      orelse = [this.parseIf()];
    } else if (this.at('kw', 'else')) {
      this.next();
      orelse = this.parseSuite();
    }
    return { type: 'If', test, body, orelse, line: t.line, col: t.col };
  }

  parseWhile() {
    const t = this.next();
    const test = this.parseExpr();
    const body = this.parseSuite();
    return { type: 'While', test, body, line: t.line, col: t.col };
  }

  parseRepeat() {
    const t = this.next();
    this.expectOp('(', 'missing "(" after repeat');
    const count = this.parseExpr();
    this.expectOp(')', 'missing ")"');
    const body = this.parseSuite();
    return { type: 'Repeat', count, body, line: t.line, col: t.col };
  }

  parseFor() {
    const t = this.next();
    if (!this.at('name')) this.fail('"for" needs a variable name');
    const name = this.next().value;
    if (!this.at('kw', 'in')) this.fail('missing "in" after the loop variable');
    this.next();
    const iter = this.parseExpr();
    const body = this.parseSuite();
    return { type: 'For', name, iter, body, line: t.line, col: t.col };
  }

  parseDef() {
    const t = this.next();
    if (!this.at('name')) this.fail('"def" needs a function name');
    const name = this.next().value;
    this.expectOp('(', 'missing "(" after the function name');
    const params = [];
    while (!this.at('op', ')')) {
      if (!this.at('name')) this.fail('missing ")"');
      params.push(this.next().value);
      if (this.at('op', ',')) {
        this.next();
        continue;
      }
      break;
    }
    this.expectOp(')', 'missing ")"');
    const body = this.parseSuite();
    return { type: 'Def', name, params, body, line: t.line, col: t.col };
  }

  parseExpr() {
    return this.parseOr();
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.at('kw', 'or')) {
      const t = this.next();
      const right = this.parseAnd();
      left = { type: 'Logic', op: 'or', left, right, line: t.line, col: t.col };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.at('kw', 'and')) {
      const t = this.next();
      const right = this.parseNot();
      left = { type: 'Logic', op: 'and', left, right, line: t.line, col: t.col };
    }
    return left;
  }

  parseNot() {
    if (this.at('kw', 'not')) {
      const t = this.next();
      const operand = this.parseNot();
      return { type: 'Unary', op: 'not', operand, line: t.line, col: t.col };
    }
    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parseAdd();
    for (;;) {
      if (this.at('op') && COMPARE_OPS.has(this.peek().value)) {
        const t = this.next();
        const right = this.parseAdd();
        left = { type: 'Bin', op: t.value, left, right, line: t.line, col: t.col };
        continue;
      }
      if (this.at('kw', 'in')) {
        const t = this.next();
        const right = this.parseAdd();
        left = { type: 'Bin', op: 'in', left, right, line: t.line, col: t.col };
        continue;
      }
      if (this.at('kw', 'not') && this.peek(1).type === 'kw' && this.peek(1).value === 'in') {
        const t = this.next();
        this.next();
        const right = this.parseAdd();
        left = {
          type: 'Unary',
          op: 'not',
          operand: { type: 'Bin', op: 'in', left, right, line: t.line, col: t.col },
          line: t.line,
          col: t.col,
        };
        continue;
      }
      return left;
    }
  }

  parseAdd() {
    let left = this.parseMul();
    while (this.at('op', '+') || this.at('op', '-')) {
      const t = this.next();
      const right = this.parseMul();
      left = { type: 'Bin', op: t.value, left, right, line: t.line, col: t.col };
    }
    return left;
  }

  parseMul() {
    let left = this.parseUnary();
    while (this.at('op', '*') || this.at('op', '/') || this.at('op', '//') || this.at('op', '%')) {
      const t = this.next();
      const right = this.parseUnary();
      left = { type: 'Bin', op: t.value, left, right, line: t.line, col: t.col };
    }
    return left;
  }

  parseUnary() {
    if (this.at('op', '-') || this.at('op', '+')) {
      const t = this.next();
      const operand = this.parseUnary();
      return { type: 'Unary', op: t.value, operand, line: t.line, col: t.col };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      if (this.at('op', '(')) {
        const t = this.next();
        const args = [];
        while (!this.at('op', ')')) {
          args.push(this.parseExpr());
          if (this.at('op', ',')) {
            this.next();
            continue;
          }
          break;
        }
        this.expectOp(')', 'missing ")"');
        node = { type: 'Call', callee: node, args, line: node.line || t.line, col: node.col || t.col };
        continue;
      }
      if (this.at('op', '[')) {
        const t = this.next();
        const index = this.parseExpr();
        this.expectOp(']', 'missing "]"');
        node = { type: 'Index', obj: node, index, line: t.line, col: t.col };
        continue;
      }
      return node;
    }
  }

  parsePrimary() {
    const t = this.peek();
    if (t.type === 'num') {
      this.next();
      return { type: 'Num', value: t.value, line: t.line, col: t.col };
    }
    if (t.type === 'str') {
      this.next();
      return { type: 'Str', value: t.value, line: t.line, col: t.col };
    }
    if (t.type === 'name') {
      this.next();
      return { type: 'Name', name: t.value, line: t.line, col: t.col };
    }
    if (t.type === 'kw') {
      if (t.value === 'True' || t.value === 'False') {
        this.next();
        return { type: 'Bool', value: t.value === 'True', line: t.line, col: t.col };
      }
      if (t.value === 'None') {
        this.next();
        return { type: 'NoneLit', line: t.line, col: t.col };
      }
    }
    if (t.type === 'op' && t.value === '(') {
      this.next();
      const inner = this.parseExpr();
      this.expectOp(')', 'missing ")"');
      return inner;
    }
    if (t.type === 'op' && t.value === '[') {
      this.next();
      const items = [];
      while (!this.at('op', ']')) {
        items.push(this.parseExpr());
        if (this.at('op', ',')) {
          this.next();
          continue;
        }
        break;
      }
      this.expectOp(']', 'missing "]"');
      return { type: 'List', items, line: t.line, col: t.col };
    }
    if (t.type === 'op' && t.value === '{') {
      this.next();
      const pairs = [];
      while (!this.at('op', '}')) {
        const key = this.parseExpr();
        this.expectOp(':', 'missing ":"');
        const value = this.parseExpr();
        pairs.push([key, value]);
        if (this.at('op', ',')) {
          this.next();
          continue;
        }
        break;
      }
      this.expectOp('}', 'missing "}"');
      return { type: 'Dict', pairs, line: t.line, col: t.col };
    }
    if (t.type === 'newline' || t.type === 'eof' || t.type === 'dedent' || t.type === 'indent') {
      this.fail('this line is not finished', t);
    }
    this.fail(`I did not expect "${String(t.value)}" here`, t);
    return null;
  }
}

export function parse(tokens) {
  return new Parser(tokens).parseProgram();
}

function collectNames(stmts, out) {
  for (const st of stmts) {
    if (!st) continue;
    switch (st.type) {
      case 'Assign':
        if (st.target.type === 'Name') out.add(st.target.name);
        break;
      case 'For':
        out.add(st.name);
        collectNames(st.body, out);
        break;
      case 'Def':
        out.add(st.name);
        for (const p of st.params) out.add(p);
        collectNames(st.body, out);
        break;
      case 'If':
        collectNames(st.body, out);
        collectNames(st.orelse, out);
        break;
      case 'While':
      case 'Repeat':
        collectNames(st.body, out);
        break;
      default:
        break;
    }
  }
}

export function resolve(program, allowed) {
  const errors = [];
  if (!program) return errors;
  const defined = new Set();
  collectNames(program.body, defined);
  const known = new Set([...defined, ...CONSTANTS, ...BUILTINS, ...KEYWORDS]);

  const gate = (name, node) => {
    if (!allowed) return;
    if (!allowed.has(name)) errors.push(new LangError(lockedMessage(name), node.line, node.col));
  };

  const walkExpr = (node) => {
    if (!node) return;
    switch (node.type) {
      case 'Name':
        if (!defined.has(node.name) && !CONSTANT_SET.has(node.name)) {
          if (BUILTIN_SET.has(node.name)) gate(node.name, node);
          else errors.push(new LangError(unknownNameMessage(node.name, known), node.line, node.col));
        }
        break;
      case 'Call':
        walkExpr(node.callee);
        for (const a of node.args) walkExpr(a);
        break;
      case 'Index':
        walkExpr(node.obj);
        walkExpr(node.index);
        break;
      case 'Bin':
      case 'Logic':
        walkExpr(node.left);
        walkExpr(node.right);
        break;
      case 'Unary':
        walkExpr(node.operand);
        break;
      case 'List':
        gate('list', node);
        for (const it of node.items) walkExpr(it);
        break;
      case 'Dict':
        gate('dict', node);
        for (const [k, v] of node.pairs) {
          walkExpr(k);
          walkExpr(v);
        }
        break;
      default:
        break;
    }
  };

  const walkStmts = (stmts) => {
    for (const st of stmts) {
      if (!st) continue;
      switch (st.type) {
        case 'ExprStmt':
          walkExpr(st.expr);
          break;
        case 'Assign':
          if (st.target.type === 'Index') walkExpr(st.target);
          walkExpr(st.value);
          break;
        case 'If':
          gate('if', st);
          walkExpr(st.test);
          walkStmts(st.body);
          walkStmts(st.orelse);
          break;
        case 'While':
          gate('while', st);
          walkExpr(st.test);
          walkStmts(st.body);
          break;
        case 'Repeat':
          gate('repeat', st);
          walkExpr(st.count);
          walkStmts(st.body);
          break;
        case 'For':
          gate('for', st);
          walkExpr(st.iter);
          walkStmts(st.body);
          break;
        case 'Def':
          gate('def', st);
          walkStmts(st.body);
          break;
        case 'Return':
          walkExpr(st.value);
          break;
        default:
          break;
      }
    }
  };

  walkStmts(program.body);
  return errors;
}
