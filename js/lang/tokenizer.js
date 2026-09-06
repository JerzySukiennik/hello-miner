// Tokenizer with tolerant INDENT/DEDENT for the Hello, Miner language.

import { LangError } from './errors.js';

export const KEYWORDS = [
  'if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return',
  'break', 'continue', 'pass', 'repeat', 'and', 'or', 'not',
  'True', 'False', 'None',
];

const KEYWORD_SET = new Set(KEYWORDS);
const TAB_WIDTH = 4;

const OPERATORS = [
  '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=',
  '+', '-', '*', '/', '%', '<', '>', '=',
  '(', ')', '[', ']', '{', '}', ',', ':', '.', ';',
];

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isNameStart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isNamePart(ch) {
  return isNameStart(ch) || isDigit(ch);
}

export function tokenize(source) {
  const text = String(source == null ? '' : source);
  const lines = text.split(/\r\n|\r|\n/);
  const tokens = [];
  const stack = [0];
  let depth = 0;
  let lastWasNewline = true;

  const push = (type, value, line, col) => {
    tokens.push({ type, value, line, col });
    lastWasNewline = type === 'newline';
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineNo = li + 1;
    let i = 0;

    if (depth === 0) {
      let width = 0;
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
        width = line[i] === '\t' ? (Math.floor(width / TAB_WIDTH) + 1) * TAB_WIDTH : width + 1;
        i++;
      }
      const rest = line.slice(i);
      if (rest === '') continue;
      if (rest[0] === '#') {
        push('comment', rest, lineNo, i + 1);
        continue;
      }
      const top = stack[stack.length - 1];
      if (width > top) {
        stack.push(width);
        push('indent', '', lineNo, i + 1);
      } else if (width < top) {
        while (stack.length > 1 && stack[stack.length - 1] > width) {
          stack.pop();
          push('dedent', '', lineNo, i + 1);
        }
      }
    }

    while (i < line.length) {
      const ch = line[i];
      const col = i + 1;

      if (ch === ' ' || ch === '\t') {
        i++;
        continue;
      }

      if (ch === '#') {
        push('comment', line.slice(i), lineNo, col);
        break;
      }

      if (isDigit(ch) || (ch === '.' && isDigit(line[i + 1] || ''))) {
        let j = i;
        let seenDot = false;
        while (j < line.length && (isDigit(line[j]) || (line[j] === '.' && !seenDot && isDigit(line[j + 1] || '')))) {
          if (line[j] === '.') seenDot = true;
          j++;
        }
        const raw = line.slice(i, j);
        push('num', Number(raw), lineNo, col);
        i = j;
        continue;
      }

      if (isNameStart(ch)) {
        let j = i;
        while (j < line.length && isNamePart(line[j])) j++;
        const word = line.slice(i, j);
        push(KEYWORD_SET.has(word) ? 'kw' : 'name', word, lineNo, col);
        i = j;
        continue;
      }

      if (ch === '"' || ch === "'") {
        let j = i + 1;
        let out = '';
        let closed = false;
        while (j < line.length) {
          const c = line[j];
          if (c === '\\' && j + 1 < line.length) {
            const nx = line[j + 1];
            if (nx === 'n') out += '\n';
            else if (nx === 't') out += '\t';
            else if (nx === 'r') out += '\r';
            else out += nx;
            j += 2;
            continue;
          }
          if (c === ch) {
            closed = true;
            j++;
            break;
          }
          out += c;
          j++;
        }
        if (!closed) throw new LangError(`missing closing ${ch === '"' ? '"' : "'"}`, lineNo, col);
        push('str', out, lineNo, col);
        i = j;
        continue;
      }

      let matched = null;
      for (const op of OPERATORS) {
        if (line.startsWith(op, i)) {
          matched = op;
          break;
        }
      }
      if (matched) {
        if (OPEN[matched]) depth++;
        else if (CLOSE.has(matched) && depth > 0) depth--;
        push('op', matched, lineNo, col);
        i += matched.length;
        continue;
      }

      throw new LangError(`I do not understand the character "${ch}"`, lineNo, col);
    }

    if (depth === 0 && !lastWasNewline && tokens.length > 0) {
      push('newline', '', lineNo, line.length + 1);
    }
  }

  const lastLine = lines.length;
  if (tokens.length > 0 && !lastWasNewline) push('newline', '', lastLine, 1);
  while (stack.length > 1) {
    stack.pop();
    push('dedent', '', lastLine, 1);
  }
  tokens.push({ type: 'eof', value: '', line: lastLine, col: 1 });
  return tokens;
}
