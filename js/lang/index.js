// Public surface of the Hello, Miner language: compile, createRun, tokenize, name tables.

import { LangError } from './errors.js';
import { tokenize, KEYWORDS } from './tokenizer.js';
import { parse, resolve, BUILTINS, CONSTANTS, GATED_CONSTRUCTS } from './parser.js';
import { createRun, createRunFromFunction, repr, truthy } from './interpreter.js';

export { LangError, tokenize, KEYWORDS, BUILTINS, CONSTANTS, GATED_CONSTRUCTS, createRun, createRunFromFunction, repr, truthy };

export function compile(source, options = {}) {
  const errors = [];
  let program = null;
  try {
    const tokens = tokenize(source);
    program = parse(tokens);
    const parseErrors = program.errors || [];
    for (const e of parseErrors) errors.push(e);
    if (parseErrors.length === 0) {
      for (const e of resolve(program, options.allowed)) errors.push(e);
    }
  } catch (e) {
    if (e instanceof LangError) errors.push(e);
    else if (e instanceof RangeError) errors.push(new LangError('this program is too complicated for me. Try splitting it into smaller pieces.', 1, 1));
    else throw e;
  }
  if (errors.length > 0) return { program: null, errors };
  return { program, errors };
}

export default { compile, createRun, createRunFromFunction, tokenize, KEYWORDS, BUILTINS, CONSTANTS, GATED_CONSTRUCTS, LangError };
