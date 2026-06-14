/**
 * PDP-1 MACRO assembly language support for CodeMirror 6.
 *
 * Used by the canonical Spacewar! (1962) sources. The PDP-1 was a
 * mid-1950s vacuum-tube + transistor research machine; MACRO is
 * Saunders/Edwards' assembler (DECUS no. 1, 1959). The dialect
 * has a handful of features that mainstream assemblers don't:
 *
 *   - Line comments are `/` to end-of-line. `///` is the
 *     conventional section divider; we colour the whole line as
 *     a section heading rather than a comment.
 *   - Numbers are octal by default. `.` is a digit for the
 *     location counter / current address. Decimal mode is
 *     entered with the `decimal` pseudo-op.
 *   - Labels end with `,` (e.g. `sbf,`).
 *   - Constants live in a literal pool introduced by `(`
 *     (e.g. `add (335671` — an octal constant). The pool is
 *     closed implicitly at end of line.
 *   - `\` is the complement operator; `\ssn` means "complement of
 *     symbol `ssn`".
 *   - `i` is an indirect-addressing modifier, not a register
 *     (e.g. `jmp i 1`). We highlight it as a special keyword
 *     when it appears in operand position.
 *   - Macros are introduced with `define <name> <params>` and
 *     closed with `term`. Both are highlighted as directives.
 */

import { StreamLanguage, StringStream, LanguageSupport } from "@codemirror/language";

// PDP-1 instruction mnemonics. Lower-case matches the source
// convention used in the surviving Spacewar listings.
const instructions: Record<string, boolean> = {
  // Memory reference
  lac: true, dac: true, lio: true, dio: true,
  add: true, sub: true, mul: true, mult: true, div: true, idv: true,
  and: true, ior: true, xor: true,
  sad: true, sas: true,
  dap: true, dip: true, dzm: true,
  jmp: true, jsp: true, jda: true, cal: true,
  xct: true, law: true,

  // Shift and rotate
  ral: true, rar: true, rcl: true, rcr: true, ril: true, rir: true,
  sal: true, sar: true, scl: true, scr: true, sil: true, sir: true,

  // Skip group
  sma: true, spa: true, sza: true, sna: true,
  szf: true, szs: true, spi: true, spq: true,
  sps: true, asp: true,

  // Operate group
  cla: true, cli: true, clf: true, cma: true,
  hlt: true, lap: true, lat: true, nop: true, opr: true,
  stf: true, cmq: true, lpd: true,

  // I/O
  iot: true, ioh: true,
  ppa: true, ppb: true, rpa: true, rpb: true,
  tyo: true, tyi: true, dpy: true, esm: true, lsm: true,
  cks: true, mcs: true, cbs: true, esc: true, lem: true,
};

// MACRO assembler pseudo-ops and directives.
const directives: Record<string, boolean> = {
  define: true, term: true, repeat: true,
  constants: true, variables: true,
  start: true, text: true, flexo: true,
  decimal: true, octal: true,
};

// Operand-position modifiers that look like identifiers but
// behave like keywords (PDP-1 uses `i` for indirect addressing).
const operandModifiers: Record<string, boolean> = {
  i: true,
};

interface PDP1State {
  // Whether the previous non-whitespace token on this line was an
  // instruction mnemonic. Used to decide whether bare `i` is the
  // indirect-addressing modifier or just a one-letter identifier.
  afterInstruction: boolean;
}

function tokenBase(stream: StringStream, state: PDP1State): string | null {
  // Section divider `///` — colour the whole line distinctly.
  if (stream.sol() && stream.match(/^\s*\/\/\//)) {
    stream.skipToEnd();
    return "heading";
  }

  if (stream.eatSpace()) return null;

  const ch = stream.peek();
  if (!ch) return null;

  // Comment: `/` to end of line.
  if (ch === "/") {
    stream.skipToEnd();
    return "comment";
  }

  // Literal-pool constant: `(335671` — open paren introduces an
  // implicit constant that lives at end of program. Colour the
  // whole token (paren + digits) as a special number.
  if (ch === "(") {
    stream.next();
    stream.eatWhile(/[0-9.]/);
    return "number.special";
  }

  // Complement operator `\sym` — the backslash plus the symbol
  // form a single complemented reference. Colour the backslash
  // as an operator and let the next token handle the symbol.
  if (ch === "\\") {
    stream.next();
    return "operator";
  }

  // Numbers (octal by default; `.` is the current-address symbol
  // when standing alone, decimal point when adjacent to digits).
  if (/\d/.test(ch)) {
    stream.next();
    stream.eatWhile(/[0-9]/);
    if (stream.peek() === ".") {
      stream.next();
      stream.eatWhile(/[0-9]/);
    }
    // Trailing `s` is the scale marker on shifts (e.g. `rar 1s`).
    if (stream.peek() === "s") {
      stream.next();
    }
    state.afterInstruction = false;
    return "number";
  }

  // Bare `.` as the current-address symbol (e.g. `dap . 1`).
  if (ch === ".") {
    stream.next();
    state.afterInstruction = false;
    return "number.special";
  }

  // Operators and punctuation.
  if (/[+\-*=]/.test(ch)) {
    stream.next();
    return "operator";
  }

  // Comma — label terminator when it follows an identifier at
  // start of line, otherwise an operand separator.
  if (ch === ",") {
    stream.next();
    return "punctuation";
  }

  // Identifiers (letters, digits, underscore; PDP-1 MACRO is
  // case-insensitive but the sources are lower-case).
  if (/[A-Za-z_]/.test(ch)) {
    const startCol = stream.column();
    stream.eatWhile(/[A-Za-z0-9_]/);
    const word = stream.current();
    const lower = word.toLowerCase();

    // Label definition: identifier immediately followed by `,`
    // at (or very near) the start of the line.
    if (startCol < 16 && stream.peek() === ",") {
      state.afterInstruction = false;
      return "labelName";
    }

    if (directives[lower]) {
      state.afterInstruction = false;
      return "keyword.directive";
    }

    if (instructions[lower]) {
      state.afterInstruction = true;
      return "keyword";
    }

    // Indirect-addressing modifier `i` in operand position.
    if (operandModifiers[lower] && state.afterInstruction) {
      return "keyword.special";
    }

    state.afterInstruction = false;
    return "variableName";
  }

  // Unknown character — consume and move on so we never stall.
  stream.next();
  return null;
}

export const pdp1Language = StreamLanguage.define<PDP1State>({
  name: "pdp1",

  startState(): PDP1State {
    return { afterInstruction: false };
  },

  token(stream: StringStream, state: PDP1State): string | null {
    if (stream.sol()) {
      state.afterInstruction = false;
    }
    return tokenBase(stream, state);
  },

  languageData: {
    commentTokens: { line: "/" },
  },
});

export function pdp1(): LanguageSupport {
  return new LanguageSupport(pdp1Language);
}
