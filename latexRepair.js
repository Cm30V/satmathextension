/**
 * Shared LaTeX repair pipeline for SAT Tutor (background + sidebar).
 * Deterministic fixes for model/JSON escape corruption and delimiter gaps.
 */


const GLUED_PROSE_WORDS = [
  'museum', 'rents', 'renting', 'rented', 'tablets', 'tablet', 'visitors',
  'earns', 'revenue', 'profit', 'expenses', 'daily', 'Wednesday', 'paying',
  'number', 'many', 'each', 'day', 'how',
  'rectangular', 'figure', 'shown', 'triangle', 'similar', 'measure', 'angle',
  'function', 'volume', 'prism', 'height', 'length', 'width', 'inches',
  'which', 'terms', 'cubic', 'more', 'than', 'given', 'find', 'what',
  'right', 'base', 'width', 'degrees', 'answer', 'choices',
  'with', 'from', 'into', 'that', 'this', 'have', 'total', 'tiles', 'probability',
  'students', 'student', 'participate', 'participating', 'participated', 'games',
  'food', 'table', 'random', 'selected', 'calculate', 'formula', 'simplify',
  'fraction', 'therefore', 'following', 'information', 'provided', 'actual',
  'identify', 'assume', 'guide', 'solution', 'next', 'students', 'whodid',
  'didnot', 'buyfood', 'notbuy', 'participatein', 'ingames', 'but', 'who', 'did',
  'not', 'buy', 'food',
  'equation', 'equations', 'linear', 'relationship', 'describes', 'solve', 'step',
  'substitute', 'points', 'pairs', 'fits', 'would', 'like', 'try', 'test', 'each',
  'both', 'usethe', 'fromthe', 'totest', 'touse', 'lets', 'first', 'table',
  'whichequation', 'youlike', 'totry', 'tryfirst',
  'when', 'whenx', 'noneof', 'however', 'recheck', 'provided', 'assume',
];

const TUTOR_CHAT_GLUE_PHRASES = [
  [/Let\s+ssolvethisstep-by-step/gi, "Let's solve this step-by-step"],
  [/\bLetsolvethisstep-by-step\b/gi, "Let's solve this step-by-step"],
  [/\bLet['\u2019\u2032]?\s*solvethisstep[\u2212-]by[\u2212-]step\b/gi, "Let's solve this step-by-step"],
  [/\bWhichequationwouldyouliketotryfirst\b/gi, 'Which equation would you like to try first'],
  [/\bFirst,let['\u2019]?susethepointsfromthetabletotesteachequation\b/gi, "First, let's use the points from the table to test each equation"],
  [/\bSubstitutethesepointsintoeachequationandseewhichonefitsbothpairs\b/gi, 'Substitute these points into each equation and see which one fits both pairs'],
  [/\bTable:\((\d+)\s*,\s*(\d+)\)\s*,\s*\((\d+)\s*,\s*(\d+)\)/g, 'Table: ($1, $2), ($3, $4)'],
  [/\bstep[\u2212-]by[\u2212-]step\b/gi, 'step-by-step'],
  [/\blinear equation\b/gi, 'linear equation'],
  [/\)(\s*[A-Z][a-z])/g, ') $1'],
];

const TABLE_PROBABILITY_GLUE_PHRASES = [
  [/\btoguideoursolution\b/gi, 'to guide our solution'],
  [/\bSimplifythefraction\b/gi, 'Simplify the fraction'],
  [/\bThetotalnumberofstudentswhodidnotbuyfoodis\b/gi, 'The total number of students who did not buy food is'],
  [/\bThetotalnumberofstudents\b/gi, 'The total number of students'],
  [/\bStudentswhodidnotbuyfoodanddidnotparticipateingames\b/gi, 'Students who did not buy food and did not participate in games'],
  [/\bStudentswhodidnotbuyfoodbutparticipatedingames\b/gi, 'Students who did not buy food but participated in games'],
  [/\bStudentswhodidnotbuyfood\b/gi, 'Students who did not buy food'],
  [/\bTheprobabilityisgivenbytheformula\b/gi, 'The probability is given by the formula'],
  [/\bcalculatetheprobabilitythatastudentselectedatrandomdidnotbuyfood\b/gi, 'calculate the probability that a student selected at random did not buy food'],
  [/\btheprobabilitythatastudentselectedatrandomdidnotbuyfoodis\b/gi, 'the probability that a student selected at random did not buy food is'],
  [/\bTherefore,theprobabilitythatastudentselectedatrandomdidnotbuyfoodis\b/gi, 'Therefore, the probability that a student selected at random did not buy food is'],
];


const LATEX_COMMANDS_WITH_BRACE_ARG = [
  'frac', 'sqrt', 'text', 'textbf', 'mathrm', 'operatorname', 'overline', 'underline'
];

const LATEX_SYMBOL_COMMANDS = [
  'pi', 'times', 'div', 'pm', 'mp', 'cdot', 'leq', 'geq', 'neq', 'approx',
  'infty', 'theta', 'alpha', 'beta', 'gamma', 'delta', 'sin', 'cos', 'tan',
  'log', 'ln', 'angle', 'triangle', 'circ', 'degree', 'sqrt'
];

const MATH_PLACEHOLDER_PREFIX = '\uE000MATH';
const MATH_PLACEHOLDER_SUFFIX = '\uE001';
const LINEAR_EQ_PREFIX = '\uE006LEQ';
const LINEAR_EQ_SUFFIX = '\uE007';
const MATH_EXPR_PREFIX = '\uE009MEX';
const MATH_EXPR_SUFFIX = '\uE00A';
const LATEX_WORD_TOKEN = '\uE00BLTX';

// Unicode and LaTeX multiplication markers used in model output.
// In RegExp source strings, LaTeX commands need doubled backslashes: `\cdot` -> `\\cdot`.
const MUL_MARKERS = '(?:×|⋅|·|\\\\times|\\\\cdot|(?<!\\\\)\\\\btimes\\\\b|(?<!\\\\)\\\\bcdot\\\\b)';

// Regex literal for tokens that should be normalized to \cdot (not already-correct \cdot).
const MUL_MARKERS_RE = /(?:×|⋅|·|(?<!\\)\\times|(?<!\\)\btimes\b|(?<!\\)\bcdot\b)/g;

const PROSE_LINE_WORDS = /\b(the|and|using|given|calculate|substitute|formula|each|these|into|find|total|separately|values|dimensions|inches|square|area|prism|rectangular|right|can|be|with|this|from|for|together|term|using|breakdown|step|surface|using)\b/i;

export function repairLatexEscapeDamage(value) {
  if (typeof value === 'string') {
    return value
      .replace(/\u0008egin/g, '\\begin')
      .replace(/\u0008eta\b/g, '\\beta')
      .replace(/\u0008oxed/g, '\\boxed')
      .replace(/\u0008mod\b/g, '\\bmod')
      .replace(/\u0008inom/g, '\\binom')
      .replace(/\u0008ullet/g, '\\bullet')
      .replace(/\u0008ecause/g, '\\because')
      .replace(/\u0008etween/g, '\\between')
      .replace(/\u0008ackslash/g, '\\backslash')
      .replace(/\u0008ar\b/g, '\\bar')
      .replace(/\u0008f\b/g, '\\bf')
      .replace(/\u0008ig\b/g, '\\big')
      .replace(/\u0008race/g, '\\brace')
      .replace(/\u0008reak/g, '\\break')
      .replace(/\u0008uildrel/g, '\\buildrel')
      .replace(/\u0008ot\b/g, '\\bot')
      .replace(/\u0008old/g, '\\bold')
      .replace(/\u0008undle/g, '\\bundle')
      .replace(/\u0008y\b/g, '\\by')
      .replace(/\u0008ext/g, '\\text')
      .replace(/\u0008ag/g, '\\tag')
      .replace(/\u0009ext\{/g, '\\text{')
      .replace(/\u0009xt\{/g, '\\text{')
      .replace(/\u0009ext\b/g, '\\text')
      .replace(/\u0009ag\{/g, '\\tag{')
      .replace(/\u0009ag\b/g, '\\tag')
      .replace(/\u0009pi\b/g, '\\pi')
      .replace(/\u0009imes\b/g, '\\times')
      .replace(/\u0009heta\b/g, '\\theta')
      .replace(/\u0009an\b/g, '\\tan')
      .replace(/\u0009o\b/g, '\\to')
      .replace(/\u0009herefore\b/g, '\\therefore')
      .replace(/\u0009riangle\b/g, '\\triangle')
      .replace(/\u0009frac\{/g, '\\frac{')
      .replace(/\u0009sqrt\{/g, '\\sqrt{')
      .replace(/\u000crac/g, '\\frac')
      .replace(/\u0009rac\{/g, '\\frac{')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b\u200c\u200d\ufeff]+/g, '');
  }
  if (Array.isArray(value)) return value.map(repairLatexEscapeDamage);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, repairLatexEscapeDamage(item)])
    );
  }
  return value;
}

export function repairSplitProseArtifacts(text) {
  return String(text || '')
    .replace(/\ba\s+nd\b/gi, 'and')
    .replace(/\ba\s+rea\b/gi, 'area')
    .replace(/\bthe\s+se\b/gi, 'these')
    .replace(/\bto\s+tal\b/gi, 'total')
    .replace(/\bthe\s+re\b/gi, 'there')
    .replace(/\ba\s+re\b/gi, 'are')
    .replace(/\ban\s+swer\b/gi, 'answer')
    .replace(/\bnu\s+mber\b/gi, 'number')
    .replace(/\bpro\s+bability\b/gi, 'probability')
    .replace(/\bred\s+tiles\b/gi, 'red tiles')
    .replace(/\bLa\s+Te\s+X\b/gi, 'LaTeX')
    .replace(/\bHow ever\b/gi, 'However')
    .replace(/\bNoneof\b/gi, 'None of');
}

export function repairLinearEquationCheckProse(text) {
  let s = String(text || '')
    .replace(/\u2212/g, '-')
    .replace(/−/g, '-');

  // Restore split numbered steps: (incorrect)\n2\n. For -> (incorrect)\n\n2. For
  s = s.replace(
    /\((correct|incorrect)\)\s*\n+\s*(\d+)\s*\n+\s*\.\s*/gi,
    '($1)\n\n$2. '
  );
  s = s.replace(
    /\(incorrect\)\s*\n+\s*(\d+)\s*\n+\s*\.\s*For\s*\n+\s*the equation/gi,
    '(incorrect)\n\n$1. For the equation'
  );

  // Undo false exponent merge on result labels before the next equation step.
  s = s.replace(
    /\((correct|incorrect)\)\^(\d+)\s*\.\s*(?=For\b)/gi,
    '($1)\n\n$2. '
  );

  // Split glued point-check lines: Whenx=1,y=1+3=4(correct)
  s = s.replace(
    /[−-]?\s*Whenx\s*=\s*(\d+)\s*,\s*y\s*=\s*(.+?)\((correct|incorrect)\)/gi,
    '\nWhen x=$1, y=$2 ($3)'
  );

  // Partially spaced variants produced by prose normalization.
  s = s.replace(
    /[−-]\s*Whenx\s*=\s*(\d+)\s*,\s*y\s*=\s*(.+?)\((correct|incorrect)\)/gi,
    '\nWhen x=$1, y=$2 ($3)'
  );

  s = s.replace(/\bWhenx\b/gi, 'When x');
  s = s.replace(/,y\s*=/g, ', y=');
  s = s.replace(/(\d)\((correct|incorrect)\)/gi, '$1 ($2)');
  s = s.replace(/\((correct|incorrect)\)([A-Za-z])/gi, '($1) $2');
  s = s.replace(/\((correct|incorrect)\)\s+(\d+\.\s*For the equation)/gi, '($1)\n\n$2');
  s = s.replace(/\bNoneof\b/gi, 'None of');
  s = s.replace(/\bNone of\s*\n+\s*the equations\b/gi, 'None of the equations');
  s = s.replace(/\bHow ever\b/gi, 'However');
  s = s.replace(/\bFor\s*\n+\s*the equation\b/gi, 'For the equation');
  s = s.replace(/(\d+)\s*\n+\s*\.\s*For\s*\n+\s*the equation/gi, '$1. For the equation');
  s = s.replace(/(\((?:correct|incorrect)\))\s+(When x=)/gi, '$1\n$2');
  s = s.replace(/(?<!\n)(?<!\d)\.(?<=\d)\s+(When x=)/g, '.\n$1');
  s = s.replace(/(?<!\n)(?<!\d)\s+(When x=)/g, '\n$1');

  return s;
}

function isMathEquationFragmentLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (/\b[a-zA-Z]{4,}\b/.test(trimmed)) return false;
  return /^[+\-−]?[\d\s+\-*^()xyrk=.\u2212−]+$/i.test(trimmed);
}

function endsMathEquationBlock(line) {
  const trimmed = String(line || '').trim();
  return /=\s*-?\d+(?:\.\d+)?\s*$/.test(trimmed)
    || /=\s*[A-Za-z][\w^]*\s*\.?\s*$/.test(trimmed);
}

function joinMultilineEquations(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    if (!isMathEquationFragmentLine(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    let j = i;
    while (j < lines.length && isMathEquationFragmentLine(lines[j])) j += 1;
    const block = lines.slice(i, j);
    const last = block[block.length - 1] || '';
    if (endsMathEquationBlock(last)) {
      out.push(block.join(' ').replace(/\s{2,}/g, ' ').trim());
    } else {
      out.push(...block);
    }
    i = j;
  }

  return out.join('\n');
}

// Rejoin model/OCR artifacts that split exponents across lines or spaces,
// e.g. "x\n8 y\n2" -> "x^8 y^2", "9x\n2" -> "9x^2", and "(x-h) 2" -> "(x-h)^2".
export function repairSplitExponents(text) {
  let s = String(text || '')
    .replace(/\u2212/g, '-')
    .replace(/−/g, '-');
  let prev = '';
  let guard = 0;

  while (prev !== s && guard < 8) {
    prev = s;
    guard += 1;
    // Caret split across a line break: x^\n8 -> x^8
    s = s.replace(/([A-Za-z0-9)])\s*\^\s*\n+\s*(\d+)/g, '$1^$2');
    // Coefficient + variable + line break + exponent: 9x\n2 -> 9x^2
    s = s.replace(
      /(?<![A-Za-z])(\d*)([A-Za-z])\s*\n+\s*(\d+)(?=[^0-9]|$)/g,
      (_m, coef, variable, exp) => `${coef}${variable}^${exp}`
    );
    // Parenthesized base + line break + exponent: (x-h)\n2 -> (x-h)^2
    s = s.replace(
      /(\((?!correct|incorrect)[^)]+\))\s*\n+\s*(\d+)(?=[^0-9+\-]|$)/g,
      (_m, base, exp) => `${base}^${exp}`
    );
    // Single-letter variable + line break + exponent digits: x\n8 -> x^8
    s = s.replace(
      /(^|[^A-Za-z0-9])([A-Za-z])\s*\n+\s*(\d+)(?=[^0-9]|$)/g,
      (_m, lead, variable, exp) => `${lead}${variable}^${exp}`
    );
    // Parenthesized base + spaced exponent in math: (x-h) 2 + -> (x-h)^2 +
    s = s.replace(
      /(\((?!correct|incorrect)[^)]+\))\s+(\d+)(?=\s*[+\-=)]|$)/g,
      (_m, base, exp) => `${base}^${exp}`
    );
    // Coefficient + variable + spaced exponent: 9x 2 + -> 9x^2 + (requires digit before letter)
    s = s.replace(
      /(\d)([A-Za-z])\s+(\d+)(?=\s*[+\-=]|$)/g,
      (_m, coef, variable, exp) => `${coef}${variable}^${exp}`
    );
    // Spaced exponent in math-like sequences: "6 x 8 y" -> "6 x^8 y"
    s = s.replace(
      /(^|[^A-Za-z0-9\\])([A-Za-z])\s+(\d+)(?=\s*[A-Za-z(\-+*/=]|$)/g,
      (_m, lead, variable, exp) => `${lead}${variable}^${exp}`
    );
    // Radius-style spaced exponent after equals: =r 2 . -> =r^2 .
    s = s.replace(
      /=\s*([A-Za-z])\s+(\d+)(?=\s*[.)]|$)/g,
      (_m, variable, exp) => `=${variable}^${exp}`
    );
  }

  return joinMultilineEquations(s);
}

function readBalancedBraces(str, startIndex) {
  if (str[startIndex] !== '{') return null;
  let depth = 0;
  for (let i = startIndex; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{' && str[i - 1] !== '\\') depth += 1;
    else if (ch === '}' && str[i - 1] !== '\\') {
      depth -= 1;
      if (depth === 0) return str.slice(startIndex, i + 1);
    }
  }
  return null;
}

function readLatexCommandWithArgs(str, startIndex) {
  if (str[startIndex] !== '\\') return null;
  const cmdMatch = str.slice(startIndex).match(/^\\([A-Za-z]+)/);
  if (!cmdMatch) return null;
  const cmd = cmdMatch[1];
  let end = startIndex + cmdMatch[0].length;
  if (LATEX_COMMANDS_WITH_BRACE_ARG.includes(cmd)) {
    while (str[end] === '{') {
      const arg = readBalancedBraces(str, end);
      if (!arg) break;
      end += arg.length;
    }
  } else if (cmd === 'sqrt') {
    if (str[end] === '[') {
      const close = str.indexOf(']', end);
      if (close !== -1) end = close + 1;
    }
    if (str[end] === '{') {
      const arg = readBalancedBraces(str, end);
      if (arg) end += arg.length;
    }
  }
  return str.slice(startIndex, end);
}

function protectMathRegions(text) {
  const regions = [];
  let out = String(text || '');
  const pattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;
  out = out.replace(pattern, (match) => {
    const id = regions.length;
    regions.push(match);
    return `${MATH_PLACEHOLDER_PREFIX}${id}${MATH_PLACEHOLDER_SUFFIX}`;
  });
  return { out, regions };
}

function restoreMathRegions(text, regions) {
  return String(text || '').replace(
    new RegExp(`${MATH_PLACEHOLDER_PREFIX}(\\d+)${MATH_PLACEHOLDER_SUFFIX}`, 'g'),
    (_m, id) => regions[Number(id)] ?? ''
  );
}

export function repairBrokenFractionSyntax(text) {
  let s = String(text || '');
  s = s
    .replace(/\\frac\s*\n+\s*\{/g, '\\frac{')
    .replace(/\\frac\{([^{}]+)\}\s*\n+\s*\{([^{}]+)\}/g, '\\frac{$1}{$2}')
    .replace(/\\frac\{([^{}]+)\}\s*\n+\s*\/\s*\{([^{}]+)\}/g, '\\frac{$1}{$2}')
    .replace(/\\frac\{([^{}]+)\}\s*\/\s*\{([^{}]+)\}/g, '\\frac{$1}{$2}')
    .replace(/\\frac\s+(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}')
    .replace(/\\frac\{([^{}]+)\}\s*\n+\s*([^{}\s]+)\}/g, '\\frac{$1}{$2}')
    .replace(/\\frac\s*\{([^{}]+)\}\s*([^{}\s/]+)(?=\s|$|[.,;:!?)])/g, '\\frac{$1}{$2}');

  // Stacked plain-text fractions (model or copy artifact): "or\n3\n/\n10" or "or 3\n10"
  s = s.replace(/\bor\s+(\d+)\s*\n+\s*\/\s*\n*\s*(\d+)\b/gi, 'or \\(\\frac{$1}{$2}\\)');
  s = s.replace(/\bor\s+(\d+)\s*\n+\s*(\d+)\b(?=\s*[.\n,;]|$)/gi, 'or \\(\\frac{$1}{$2}\\)');

  return s;
}

export function repairTutorChatGluedProse(text) {
  let s = String(text || '')
    .replace(/\u2212/g, '-')
    .replace(/−/g, '-');
  for (const [pattern, replacement] of TUTOR_CHAT_GLUE_PHRASES) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

function protectLinearEquationLines(text) {
  const regions = [];
  const out = String(text || '').replace(
    /\by\s*=\s*(?:\\?\([^)]*\\?\)|[^\n|A-Z]+)/gi,
    (match) => {
      const id = regions.length;
      regions.push(match);
      return `${LINEAR_EQ_PREFIX}${id}${LINEAR_EQ_SUFFIX}`;
    }
  );
  return { out, regions };
}

function restoreLinearEquationLines(text, regions) {
  return String(text || '').replace(
    new RegExp(`${LINEAR_EQ_PREFIX}(\\d+)${LINEAR_EQ_SUFFIX}`, 'g'),
    (_m, id) => regions[Number(id)] ?? ''
  );
}

function isMathExpressionLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || !/=/.test(trimmed)) return false;
  if (/^#{1,6}\s/.test(trimmed)) return false;
  const mathChars = (trimmed.match(/[\d=+\-*^()[\]\\/]|\\frac|\\sqrt|[xyrk]/gi) || []).length;
  const proseWords = (trimmed.match(/\b[a-zA-Z]{4,}\b/g) || []).length;
  if (mathChars >= 4 && mathChars >= proseWords * 2) return true;
  return /^\s*[\d(+-]*\d*[A-Za-z][\s\S]*=\s*[\d(+-]/.test(trimmed);
}

function protectMathExpressionLines(text) {
  const regions = [];
  const out = String(text || '').replace(/^[^\n]+$/gm, (line) => {
    if (!isMathExpressionLine(line)) return line;
    const id = regions.length;
    regions.push(line.replace(/\s*\n+\s*/g, ' ').trim());
    return `${MATH_EXPR_PREFIX}${id}${MATH_EXPR_SUFFIX}`;
  });
  return { out, regions };
}

function restoreMathExpressionLines(text, regions) {
  return String(text || '').replace(
    new RegExp(`${MATH_EXPR_PREFIX}(\\d+)${MATH_EXPR_SUFFIX}`, 'g'),
    (_m, id) => regions[Number(id)] ?? ''
  );
}

function stripTutorMarkdownHeadings(text) {
  return String(text || '')
    .replace(/\s*#{1,6}\s+/g, '\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1');
}

export function repairLinearEquationText(text) {
  return wrapLinearEquations(repairLinearEquationStructure(text));
}

function repairLinearEquationStructure(text) {
  let s = String(text || '')
    .replace(/\u2212/g, '-')
    .replace(/−/g, '-')
    .replace(/[\u200b\ufeff\u00ad\u2032]/g, '');

  // Split glued prose immediately after an equation: y=3x-2Let -> y=3x-2 Let
  s = s.replace(/(\by\s*=[^A-Z\n|]{1,60}?)(?=[A-Z][a-z])/g, '$1 ');

  // Stacked coefficient before x in y = \n2\n1\n x+3
  s = s.replace(
    /\by\s*=\s*(?:\\?\(\s*)?\n*(\d+)\s*\n+\s*(\d+)\s*\n+\s*x([+\-\d]*)/gi,
    (_m, top, bottom, tail) => {
      const num = Number(bottom) < Number(top) ? bottom : top;
      const den = Number(bottom) < Number(top) ? top : bottom;
      return `\\(y=\\frac{${num}}{${den}}x${tail}\\)`;
    }
  );

  // Merge detached stacked fraction with the x term.
  s = s.replace(
    /\by\s*=\s*(?:\\?\(\s*)?\\frac\{(\d+)\}\{(\d+)\}\s*(?:\\?\)\s*)?\s*([+\-]?\s*x[+\-\d]*)/gi,
    (_m, num, den, tail) => `\\(y=\\frac{${num}}{${den}}${tail.replace(/\s+/g, '')}\\)`
  );

  // Rejoin spurious spaces inside coefficients: y= 2 x+1 -> y=2x+1
  s = s.replace(/\by\s*=\s*(-?\d+)\s+([xy])(?=[+\-]?\d)/gi, (_m, coef, variable) => `y=${coef}${variable}`);
  s = s.replace(/\by\s*=\s*(-?\d+)\s+([xy])\b/gi, (_m, coef, variable) => `y=${coef}${variable}`);

  return s;
}

function wrapLinearEquations(text) {
  return applyOutsideMathRegions(String(text || ''), chunk =>
    chunk.replace(
      /\by\s*=\s*([^\n|]+?)(?=\s*(?:\||$|\n|[.;]|Let\b|First\b|Which\b|The\b|Table\b|Substitute\b))/gi,
      (match, expr) => {
        const cleaned = expr.trim().replace(/[ \t]+/g, '').replace(/\n+/g, '');
        if (!cleaned || cleaned.length > 48) return match;
        if (!/^[-+\\(\d\\fracxy\d\{\}\^.)]+$/i.test(cleaned)) return match;
        return `\\(y=${cleaned}\\)`;
      }
    )
  );
}

function isLikelyAnswerChoicesBlock(content) {
  const s = String(content || '').trim();
  if (!s) return false;
  if (/\|/.test(s)) {
    const parts = s.split(/\|/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every(p => p.length <= 80)) return true;
  }
  if (/^\s*y\s*=/.test(s) && s.includes('|') && s.split(/\|/).every(p => /^\s*y\s*=/.test(p.trim()))) return true;
  if (s.length > 120) return false;
  if (/[.?!]/.test(s) && s.length > 40) return false;
  if (/\b(students|probability|therefore|simplify|formula)\b/i.test(s) && s.length > 30) return false;
  return /^[\d\s.\\()+\-*/^_{}\s,|]+$/.test(s) || s.length <= 40;
}

export function repairMisplacedAnswerChoicesMarker(text) {
  return String(text || '').replace(/Answer choices:\s*/gi, (match, offset, whole) => {
    const rest = whole.slice(offset + match.length);
    const nextBreak = rest.search(/\n{2,}/);
    const block = (nextBreak === -1 ? rest : rest.slice(0, nextBreak)).trim();
    if (isLikelyAnswerChoicesBlock(block)) return match;
    return 'Given values: ';
  });
}

export function repairTableProbabilityGluedProse(text) {
  let s = String(text || '');
  for (const [pattern, replacement] of TABLE_PROBABILITY_GLUE_PHRASES) {
    s = s.replace(pattern, replacement);
  }
  s = s
    .replace(/(\d)(Thetotalnumberofstudentswhodidnotbuyfoodis)/gi, '$1. The total number of students who did not buy food is')
    .replace(/(\d)(Thetotalnumberofstudents)/gi, '$1. The total number of students')
    .replace(/to guide our solution\)\s*:?/gi, 'to guide our solution:')
    .replace(/(\d+)−(?=[A-Za-z(])/g, '$1\n- ')
    .replace(/(?:^|[\n:])\s*−\s*(?=[A-Za-z(])/gm, '\n- ')
    .replace(/([:;])\s*−\s*(?=[A-Za-z(])/g, '$1 - ');
  return s;
}

// Convert model/OCR stacked numeric fractions like "300\n135" -> \frac{135}{300}.
export function repairStackedFractionLines(text) {
  const marker = /Answer choices:\s*/i;
  const match = String(text || '').match(marker);
  if (match) {
    const tail = text.slice(match.index);
    if (isLikelyAnswerChoicesBlock(tail.slice(match[0].length).trim())) {
      return repairStackedFractionLines(text.slice(0, match.index)) + tail;
    }
  }

  let s = String(text || '');
  let prev = '';
  let guard = 0;

  while (prev !== s && guard < 8) {
    prev = s;
    guard += 1;
    s = s.replace(
      /([=:\s]|^|\n)(\d{1,5})\s*\n+\s*(\d{1,5})(?=\s*(?:\n|\.|,|;|:|\)|$|\s*=|\s*Therefore|\s*Next|\s*Simplify))/gim,
      (match, lead, top, bottom, offset, whole) => {
        const a = Number(top);
        const b = Number(bottom);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return match;
        if (a <= 20 && b <= 20) {
          const before = whole.slice(Math.max(0, offset - 48), offset);
          if (!/[=]|Simplify|fraction|probability|\by\s*=\s*$/im.test(before)) return match;
        }
        const num = b < a ? b : a;
        const den = b < a ? a : b;
        return `${lead}\\(\\frac{${num}}{${den}}\\)`;
      }
    );
  }

  return s;
}

export function repairCorruptLatexTokens(text) {
  if (!text || typeof text !== 'string') return text;
  let s = String(text || '');

  // Handle numeric-concatenation corruption like "24×5" or "2 4⋅5" where
  // the model accidentally glued a coefficient digit to the next dimension.
  // Do this before normalizing the multiplication sign so we catch both forms.
  // Examples:
  //  "24×5" -> "2(4)(5)"
  //  "2 4⋅5" -> "2(4)(5)"
  const mul = MUL_MARKERS;

  // Surface-area substitution corruption: glued coefficient digits in a sum of
  // three face products, e.g. "2 4⋅5 + 24⋅6 + 25⋅6" -> "2(4 \cdot 5 + 4 \cdot 6 + 5 \cdot 6)".
  // Run before per-term splitting so the full sum is captured first.
  s = s.replace(
    new RegExp(
      `2\\s*(\\d+)\\s*${mul}\\s*(\\d+)\\s*\\+\\s*2(\\d)\\s*${mul}\\s*(\\d+)\\s*\\+\\s*2(\\d)\\s*${mul}\\s*(\\d+)`,
      'g'
    ),
    (_m, a, b, c, d, e, f) => `2(${a} \\cdot ${b} + ${c} \\cdot ${d} + ${e} \\cdot ${f})`
  );

  // Handle numeric-concatenation corruption like "24×5" or "2 4⋅5" where
  // the model accidentally glued a coefficient digit to the next dimension.
  // Do this before normalizing the multiplication sign so we catch both forms.
  // Examples:
  //  "24×5" -> "2(4)(5)"
  //  "2 4⋅5" -> "2(4)(5)"
  s = s.replace(new RegExp(`\\b2\\s*([0-9])\\s*${mul}\\s*([0-9]+)\\b`, 'g'), '2($1)($2)');
  s = s.replace(new RegExp(`\\b2([0-9])\\s*${mul}\\s*([0-9]+)\\b`, 'g'), '2($1)($2)');
  // Parenthesized inner products: "2(4⋅6)" -> "2(4 \cdot 6)"
  s = s.replace(new RegExp(`\\(([0-9]+)\\s*${mul}\\s*([0-9]+)\\)`, 'g'), '($1 \\cdot $2)');

  // Surface-area formula spacing: "2 lw + 2 lh + 2 wh" -> "2(lw + lh + wh)"
  s = s.replace(/\b2\s*l\s*w\s*\+\s*2\s*l\s*h\s*\+\s*2\s*w\s*h\b/gi, '2(lw + lh + wh)');

  // Consolidate already-split face products: "2(4)(5) + 2(4)(6) + 2(5)(6)".
  s = s.replace(
    /2\s*\(\s*(\d+)\s*\)\s*\(\s*(\d+)\s*\)\s*\+\s*2\s*\(\s*(\d+)\s*\)\s*\(\s*(\d+)\s*\)\s*\+\s*2\s*\(\s*(\d+)\s*\)\s*\(\s*(\d+)\s*\)/g,
    (_m, a, b, c, d, e, f) => `2(${a} \\cdot ${b} + ${c} \\cdot ${d} + ${e} \\cdot ${f})`
  );

  // Convert remaining multiplication markers to \cdot for a cleaner look
  // in LaTeX (less visually heavy than \times in many contexts).
  s = s.replace(MUL_MARKERS_RE, '\\cdot ');

  // Generic literal "\t\command" corruption from local models / JSON
  s = s.replace(/\\t\\(?=[A-Za-z])/g, '\\');
  // Fix line-break corruption: lone backslash before newline -> double backslash
  // (skip when already escaped as \\).
  s = s.replace(/(?<!\\)\\(\r?\n)/g, '\\\\$1');
  s = s
    .replace(/\\t\\text\{/g, '\\text{')
    .replace(/\\tfrac\{/g, '\\frac{')
    .replace(/\\tsqrt\{/g, '\\sqrt{')
    .replace(/\\tpi\b/g, '\\pi')
    .replace(/\\tleq\b/g, '\\leq')
    .replace(/\\tgeq\b/g, '\\geq')
    .replace(/\\tneq\b/g, '\\neq')
    .replace(/\\ttimes\b/g, '\\times')
    .replace(/\\tcdot\b/g, '\\cdot')
    .replace(/\\tangle\b/g, '\\angle')
    .replace(/\\ttheta\b/g, '\\theta')
    .replace(/\\theight_([A-Za-z]+)/gi, 'h_$1')
    .replace(/\\theight\b/gi, 'h')
    .replace(/\\tradius_([A-Za-z]+)/gi, 'r_$1')
    .replace(/\\tradius\b/gi, 'r')
    .replace(/\\tVolume\b/g, 'V')
    .replace(/\\tnew\b/g, '\\text{new}')
    .replace(/\\tbase\s+area_([A-Za-z]+)/gi, '\\pi r_$1^2')
    .replace(/\\tbase\s+area\b/gi, '\\pi r^2')
    .replace(/\\text\{([^}\\)]+)\\?\)\s*\\?\(\s*([^}\\)]+)\}/g, '\\text{$1 $2}')
    .replace(/\\text\{([^}\\)]+)\\?\)\s*([^}\\{]+)\}/g, '\\text{$1 $2}')
    .replace(/\\text\{base\s*area\}(_[A-Za-z]+)?/gi, (_, sub) => sub ? `\\pi r${sub}^2` : '\\pi r^2')
    .replace(/\\text\{pi\}/gi, '\\pi')
    .replace(/\\text\{height\}(_[A-Za-z]+)?/gi, (_, sub) => (sub ? `h${sub}` : 'h'))
    .replace(/\\text\{radius\}(_[A-Za-z]+)?/gi, (_, sub) => (sub ? `r${sub}` : 'r'))
    .replace(/V_\{\s*\\text\{new\}\s*\}/g, 'V_{\\text{new}}')
    .replace(/_\{\s+/g, '_{')
    .replace(/\s+\}/g, '}')
    .replace(/\\pi r\^2\\times/g, '\\pi r^2 \\times')
    .replace(/\\times\s+\\times/g, '\\times')
    .replace(/\\\[(\d+)(ex|em)\]/g, '\\\\[$1$2]')
    .replace(/V\s+([A-Za-z])\s*[\u200b\u00ad]?\s*=/g, 'V_$1 =')
    .replace(/(\d)\.\s+(\d)/g, '$1.$2');

  s = repairProbabilityNotation(s);
  s = repairBrokenFractionSyntax(s);

  // Bare \sqrt followed by digits, with or without braces.
  s = s.replace(/\\sqrt\{(\d+)\}/g, '\\sqrt{$1}');
  s = s.replace(/\\sqrt\s+(\d+)/g, '\\sqrt{$1}');
  s = s.replace(/\\sqrt(\d+)/g, '\\sqrt{$1}');
  // Coefficient split from \sqrt across a line break: "4\n\sqrt{74}".
  s = s.replace(/(\d{1,2})\s*\n\s*\\sqrt\s*\{(\d+)\}/g, '$1\\sqrt{$2}');

  // Fix numeric concatenation corruption like "24⋅5" appearing outside of
  // strict formula lines: treat a leading '2' joined to a digit as coefficient
  // (2) and split it into explicit multiplication: 24⋅5 -> 2(4)(5)
  s = s.replace(new RegExp(`\\b2([0-9])\\s*${mul}\\s*([0-9]+)\\b`, 'g'), '2($1)($2)');

  return repairSplitProseArtifacts(s);
}

export function repairProbabilityNotation(text) {
  let s = String(text || '');
  s = s
    .replace(/([A-Za-z])\\\(\s*(\\text\{[^}]+\})\s*\\\)/g, '\\($1($2)\\)')
    .replace(/(?<![(\\])\b([A-Za-z])\(\s*(\\text\{[^}]+\})\s*\)/g, '\\($1($2)\\)')
    .replace(/(?<![(\\])\bP\s*\(\s*\\text\{([^}]+)\}\s*\)/g, '\\(P(\\text{$1})\\)');
  return s;
}

export function convertPlainNumericFractions(text) {
  return String(text || '').replace(
    /(^|[\s=:(\[,]|or\s)(\d+)\s*\/\s*(\d+)(?=$|[\s.,;:!?)}\]]|\b)/g,
    (match, prefix, num, den, offset, whole) => {
      const before = whole.slice(0, offset);
      // Preserve UI counters like "Hint 1/3:" from becoming stacked fractions.
      if (/\bHint\s+$/i.test(before + prefix)) return match;
      return `${prefix}\\(\\frac{${num}}{${den}}\\)`;
    }
  );
}

function copyPlaceholderBlock(s, i) {
  const end = s.indexOf(MATH_PLACEHOLDER_SUFFIX, i);
  if (end === -1) return null;
  return { chunk: s.slice(i, end + MATH_PLACEHOLDER_SUFFIX.length), next: end + MATH_PLACEHOLDER_SUFFIX.length };
}

function wrapCommandOccurrences(s, commandNames) {
  let result = '';
  let i = 0;
  while (i < s.length) {
    if (s.startsWith(MATH_PLACEHOLDER_PREFIX, i)) {
      const block = copyPlaceholderBlock(s, i);
      if (block) {
        result += block.chunk;
        i = block.next;
        continue;
      }
    }

    if (s[i] === '\\') {
      let matched = null;
      for (const cmd of commandNames) {
        if (s.startsWith(`\\${cmd}`, i)) {
          matched = readLatexCommandWithArgs(s, i);
          if (matched?.startsWith(`\\${cmd}`)) break;
          matched = null;
        }
      }
      if (matched) {
        result += `\\(${matched}\\)`;
        i += matched.length;
        continue;
      }
    }

    result += s[i];
    i += 1;
  }
  return result;
}

export function wrapBareLatexCommands(text) {
  const { out, regions } = protectMathRegions(String(text || ''));
  let s = out;

  s = wrapCommandOccurrences(s, ['frac', 'sqrt', 'text', 'textbf', 'mathrm', 'operatorname']);
  s = convertPlainNumericFractions(s);

  return restoreMathRegions(s, regions);
}

export function mergeAdjacentInlineMath(text) {
  let s = String(text || '');
  let prev = '';
  let guard = 0;
  while (prev !== s && guard < 12) {
    prev = s;
    guard += 1;
    s = s
      .replace(/\\\(([\s\S]*?)\\\)\s*=\s*\\\(([\s\S]*?)\\\)/g, '\\($1 = $2\\)')
      .replace(/\\\(([\s\S]*?)\\\)\s*\\=\s*\\\(([\s\S]*?)\\\)/g, '\\($1 = $2\\)')
      .replace(/\\\(([\s\S]*?)\\\)\s*\\leq\s*\\\(([\s\S]*?)\\\)/g, '\\($1 \\leq $2\\)')
      .replace(/\\\(([\s\S]*?)\\\)\s*\\geq\s*\\\(([\s\S]*?)\\\)/g, '\\($1 \\geq $2\\)')
      .replace(/\\\(([\s\S]*?)\\\)\s*\\neq\s*\\\(([\s\S]*?)\\\)/g, '\\($1 \\neq $2\\)')
      .replace(/\\\(([\s\S]*?)\\\)\s*\\approx\s*\\\(([\s\S]*?)\\\)/g, '\\($1 \\approx $2\\)')
      .replace(/\\\(([\s\S]*?)\\\)\s*\\times\s*\\\(([\s\S]*?)\\\)/g, '\\($1 \\times $2\\)')
      .replace(/\\\(([\s\S]*?)\\\)\s*\+\s*\\\(([\s\S]*?)\\\)/g, '\\($1 + $2\\)')
      .replace(/\\\(([\s\S]*?)\\\)\s*-\s*\\\(([\s\S]*?)\\\)/g, '\\($1 - $2\\)');
  }
  return s;
}

export function wrapEquationChains(text) {
  const { out, regions } = protectMathRegions(String(text || ''));
  let s = out;

  // Probability-style equation chains with mixed delimiters, e.g.
  // P(\text{Red}) = \frac{a}{b} = 0.3
  s = s.replace(
    /(?:[A-Za-z]\(\s*\\text\{[^{}]+\}\s*\)|\\text\{[^{}]+\})(?:\s*=\s*(?:\\frac\{[^{}]+\}\{[^{}]+\}|\d+(?:\.\d+)?))+?/g,
    (match) => {
      if (match.includes(MATH_PLACEHOLDER_PREFIX)) return match;
      return `\\(${match.trim()}\\)`;
    }
  );

  return restoreMathRegions(s, regions);
}

export function repairTutorLatex(text) {
  if (!text || typeof text !== 'string') return text;
  let s = repairCorruptLatexTokens(repairLatexEscapeDamage(text));

  s = s
    .replace(/(?<!\\)egin\{/g, '\\begin{')
    .replace(/(?<!\\)end\{/g, '\\end{')
    .replace(/(?<![\\a-zA-Z])ext\{/g, '\\text{')
    .replace(/(?<![\\a-zA-Z])rac\{/g, '\\frac{')
    .replace(/(?<![\\a-zA-Z])qrt\{/g, '\\sqrt{')

  // Join split coefficient + radicand lines produced by some model outputs.
  // Example: a line ending with "= 4" followed by a line "74" -> "= 4\\sqrt{74}".
  // This is conservative: we only join when the previous line ends with an equality
  // and a small integer coefficient (<= 20) and the next line is a plain integer
  // or decimal (the radicand). This avoids over-eager rewriting of unrelated
  // numeric pairs (like dimensions).
  const lines = s.split(/\r?\n/);
  const outLines = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (next != null) {
      const m = cur.match(/^(.*=\s*)(\d{1,2})\s*$/);
      const nextClean = String(next || '').trim();
      if (m && /^\d+(?:\.\d+)?$/.test(nextClean)) {
        const prefix = m[1];
        const coef = Number(m[2]);
        const rad = nextClean.replace(/,/g, '');
        // Only convert when coefficient is plausibly a pulled-out factor
        // (small positive integer) and radicand is at least 2.
        if (Number.isFinite(coef) && coef > 0 && coef <= 20 && Number(rad) >= 2) {
          outLines.push(prefix + coef + "\\sqrt{" + rad + "}");
          i++; // skip the next line
          continue;
        }
      }
    }
    outLines.push(lines[i]);
  }
  s = outLines.join('\n');

  // Also handle compact same-line patterns that often appear in choices, e.g.
  // "Answer choices: 8 6 | 4 74 | 48 | 1,184" -> "8\\sqrt{6} | 4\\sqrt{74} | 48 | 1,184".
  // Only do this for short coefficients (<=20) to stay conservative.
  s = s.replace(/(Answer choices:\s*|\|)\s*(\d{1,2})\s+([0-9]{1,4}(?:\.[0-9]+)?)(?=(?:\s|\||$))/gi, (m, pfx, coef, rad) => {
    const c = Number(coef);
    if (!Number.isFinite(c) || c <= 0 || c > 20) return m;
    return (pfx || '') + c + "\\sqrt{" + rad.replace(/,/g, '') + "}";
  });

  // Simplify \sqrt{...} where possible (integer factor extraction from integer multiplicative factors)
  s = s.replace(/\\sqrt\{([^}]+)\}/g, (_m, inner) => {
    // Normalize multiplication separators into '*'
    const normalized = inner.replace(/\\times|×|\*/g, '*').trim();
    const parts = normalized.split('*').map(p => p.trim()).filter(Boolean);

    // If single integer, use existing integer simplifier via a temporary call
    if (parts.length === 1 && /^[0-9]+$/.test(parts[0])) {
      return simplifyIntegerSqrtExpressions(`\\sqrt{${parts[0]}}`);
    }

    let outside = 1;
    const remainder = [];

    for (const p of parts) {
      if (/^[0-9]+$/.test(p)) {
        let n = parseInt(p, 10);
        let pulled = 1;
        // Pull out largest square factors iteratively
        for (let k = Math.floor(Math.sqrt(n)); k >= 2; k--) {
          const sq = k * k;
          if (n % sq === 0) {
            pulled *= k;
            n = n / sq;
            k = Math.floor(Math.sqrt(n)) + 1; // restart loop for reduced n
          }
        }
        outside *= pulled;
        if (n > 1) remainder.push(String(n));
      } else {
        // Keep decimals or symbolic factors inside
        remainder.push(p);
      }
    }

    const remStr = remainder.join('*') || '1';
    if (outside === 1) return `\\sqrt{${inner}}`;
    if (remStr === '1') return String(outside);
    return `${outside}\\sqrt{${remStr}}`;
  });

  return s;
}

// Conservative one-off helper intended for manual or opt-in use.
// Normalizes stray display delimiters used like line markers and simplifies
// \sqrt{...} where factors include integer perfect squares (e.g. \sqrt{64 \times 18.5} -> 8\sqrt{18.5}).
export function simplifyProblemSnippet(text) {
  let s = String(text || '');

  // Fix unmatched opening display delimiters (heuristic): replace earliest unmatched "\\[" with a newline.
  const opens = (s.match(/\\\[/g) || []).length;
  const closes = (s.match(/\\\]/g) || []).length;
  if (opens > closes) {
    let toReplace = opens - closes;
    s = s.replace(/\\\[/g, () => (toReplace-- > 0 ? '\n' : '\['));
  }

  // Simplify \sqrt{...} where possible (integer factor extraction from integer multiplicative factors)
  s = s.replace(/\\sqrt\{([^}]+)\}/g, (_m, inner) => {
    // Normalize multiplication separators into '*'
    const normalized = inner.replace(/\\times|×|\*/g, '*').trim();
    const parts = normalized.split('*').map(p => p.trim()).filter(Boolean);

    // If single integer, use existing integer simplifier via a temporary call
    if (parts.length === 1 && /^[0-9]+$/.test(parts[0])) {
      return simplifyIntegerSqrtExpressions(`\\sqrt{${parts[0]}}`);
    }

    let outside = 1;
    const remainder = [];

    for (const p of parts) {
      if (/^[0-9]+$/.test(p)) {
        let n = parseInt(p, 10);
        let pulled = 1;
        // Pull out largest square factors iteratively
        for (let k = Math.floor(Math.sqrt(n)); k >= 2; k--) {
          const sq = k * k;
          if (n % sq === 0) {
            pulled *= k;
            n = n / sq;
            k = Math.floor(Math.sqrt(n)) + 1; // restart loop for reduced n
          }
        }
        outside *= pulled;
        if (n > 1) remainder.push(String(n));
      } else {
        // Keep decimals or symbolic factors inside
        remainder.push(p);
      }
    }

    const remStr = remainder.join('*') || '1';
    if (outside === 1) return `\\sqrt{${inner}}`;
    if (remStr === '1') return String(outside);
    return `${outside}\\sqrt{${remStr}}`;
  });

  return s;
}

// Simplify \sqrt{N} when N has a non-trivial perfect-square factor.
function simplifyIntegerSqrtExpressions(s) {
  return String(s || '').replace(/\\sqrt\{(\d+)\}/g, (_m, numStr) => {
    const n = Number(numStr);
    if (!Number.isFinite(n) || n <= 1) return `\\sqrt{${numStr}}`;
    const root = Math.floor(Math.sqrt(n));
    for (let k = root; k >= 2; k--) {
      const square = k * k;
      if (n % square === 0) {
        const rem = n / square;
        return `${k}\\sqrt{${rem}}`;
      }
    }
    return `\\sqrt{${numStr}}`;
  });
}

// Simplify sqrt expressions with products, decimals, or '\\times' separators.
function simplifyGeneralSqrtExpressions(s) {
  return String(s || '').replace(/\\sqrt\{([^}]+)\}/g, (_m, inner) => {
    let expr = inner.replace(/(?:\\)*times|×|\*/gi, '*').trim();
    // Split multiplicative factors
    const parts = expr.split('*').map(p => p.trim()).filter(Boolean);
    // If it's a single integer, let integer simplifier handle it.
    if (parts.length === 1 && /^[0-9]+$/.test(parts[0])) return `\\sqrt{${parts[0]}}`;

    let outside = 1;
    const remainderParts = [];

    for (const p of parts) {
      if (/^[0-9]+$/.test(p)) {
        // integer factor: pull out perfect-square factors
        let n = parseInt(p, 10);
        if (n <= 0) { remainderParts.push(p); continue; }
        // find largest square divisor
        let pulled = 1;
        for (let k = Math.floor(Math.sqrt(n)); k >= 2; k--) {
          const square = k * k;
          if (n % square === 0) {
            pulled = k;
            n = n / square;
            // try again on reduced n
            k = Math.floor(Math.sqrt(n)) + 1;
          }
        }
        outside *= pulled;
        if (n > 1) remainderParts.push(String(n));
      } else {
        // non-integer (decimal or expression) — keep inside
        remainderParts.push(p);
      }
    }

    const remainder = remainderParts.join('*') || '1';
    if (remainder === '1') {
      return `${outside}` + `\\sqrt{1}`.replace('\\sqrt{1}', '');
    }
    // If outside is 1, return original form
    if (outside === 1) return `\\sqrt{${inner}}`;
    return `${outside}\\sqrt{${remainder}}`;
  });
}

// Fix unmatched display delimiters (\[) often inserted as line markers by broken outputs.
function fixUnmatchedDisplayDelimiters(s) {
  const opens = (s.match(/\\\[/g) || []).length;
  const closes = (s.match(/\\\]/g) || []).length;
  if (opens <= closes) return s;
  // Replace unmatched opening display delimiters with a newline separator
  // (heuristic: assume they were meant as line breaks rather than true display math)
  let toReplace = opens - closes;
  return s.replace(/\\\[/g, (m) => (toReplace-- > 0 ? '\n' : m));
}

export function normalizeProseSpacing(text) {
  let s = String(text || '').trim();
  if (!s) return s;

  s = s.replace(/\bLaTeX\b/gi, LATEX_WORD_TOKEN);

  const repairGluedPhrases = value => value
    .replace(/\bforeach\b/gi, 'for each')
    .replace(/\bforeach(?=[A-Za-z])/gi, 'for each ')
    .replace(/\bforthe\b/gi, 'for the')
    .replace(/\bforthe(?=[A-Za-z])/gi, 'for the ')
    .replace(/\bofthese\b/gi, 'of these')
    .replace(/\bofthese(?=[A-Za-z])/gi, 'of these ')
    .replace(/\btothe\b/gi, 'to the')
    .replace(/\btothe(?=[A-Za-z])/gi, 'to the ')
    .replace(/\bthemuseum\b/gi, 'the museum')
    .replace(/\bthemuseum(?=[A-Za-z])/gi, 'the museum ');

  s = s
    .replace(/([A-Za-z])\$(\d)/g, '$1 $$$2')
    .replace(/\$(\d+(?:\.\d+)?)(?=[A-Za-z])/g, '$$$1 ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([,.;:?])(?=[A-Za-z0-9])/g, '$1 ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/([°′])/g, ' $1')
    .replace(/△/g, ' △ ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b\u200c\u200d\ufeff]/g, '');

  s = repairGluedPhrases(s);

  const sorted = [...GLUED_PROSE_WORDS].sort((a, b) => b.length - a.length);
  let previousPass = '';
  let pass = 0;
  while (previousPass !== s && pass < 8) {
    previousPass = s;
    pass += 1;
    for (const word of sorted) {
      const re = new RegExp(`(^|[^A-Za-z])(${word})(?=[a-z]{2,})`, 'gi');
      let prev = '';
      while (prev !== s) {
        prev = s;
        s = s.replace(re, '$1$2 ');
      }
    }
  }

  s = repairGluedPhrases(s);

  s = s
    .replace(/(\w)\s+s\s+(base|width|length|height)/gi, "$1's $2")
    .replace(/\s{2,}/g, ' ')
    .trim();

  s = s.replace(new RegExp(LATEX_WORD_TOKEN, 'g'), 'LaTeX');

  return repairSplitProseArtifacts(s);
}

export function stripMathDelimitersFromExpression(value) {
  return repairLatexEscapeDamage(value)
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    .replace(/\$\$/g, '')
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\\\[/g, '')
    .replace(/\\\]/g, '')
    .replace(/\$(?!\d)/g, '')
    .trim();
}

export function repairTutorContent(text) {
  let s = repairLatexEscapeDamage(String(text || '').trim());
  s = repairLinearEquationCheckProse(s);
  s = repairSplitExponents(s);
  s = repairTableProbabilityGluedProse(s);
  s = repairLinearEquationStructure(s);
  s = repairTutorChatGluedProse(s);
  s = repairMisplacedAnswerChoicesMarker(s);
  s = repairStackedFractionLines(s);
  s = repairSplitExponents(s);
  const { out: protectedText, regions: linearEqRegions } = protectLinearEquationLines(s);
  const { out: mathProtected, regions: mathExprRegions } = protectMathExpressionLines(protectedText);
  s = repairSplitExponents(mathProtected);
  s = repairLinearEquationCheckProse(repairSplitProseArtifacts(normalizeProseSpacing(s)));
  s = restoreMathExpressionLines(s, mathExprRegions);
  s = restoreLinearEquationLines(s, linearEqRegions);
  s = repairSplitExponents(s);
  s = stripTutorMarkdownHeadings(s);
  s = repairTutorLatex(s);
  s = wrapLinearEquations(s);
  return s;
}

export function sanitizeTutorText(text) {
  return repairLinearEquationCheckProse(finalizeTutorMath(repairTutorContent(text)));
}

function isTutorPointCheckLine(line) {
  const trimmed = String(line || '').trim();
  return /^-?\s*When x\s*=/i.test(trimmed)
    || /^\d+\.\s*For the equation/i.test(trimmed)
    || /\bNone of the equations\b/i.test(trimmed);
}

function isStandaloneEquationLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || !/=/.test(trimmed)) return false;
  if (/^\s*=/.test(trimmed)) return false;
  if (/\\\(|\\\[|\$\$/.test(trimmed)) return false;
  if (isProseLine(trimmed)) return false;
  if (isTutorPointCheckLine(trimmed)) return false;
  return /^[\d([+−-]|[A-Za-z]\s*=/.test(trimmed);
}

function wrapStandaloneEquations(text) {
  return String(text || '').split(/\n/).map(line => {
    const trimmed = line.trim();
    if (!isStandaloneEquationLine(trimmed)) return line;
    const expr = stripMathDelimitersFromExpression(trimmed);
    return `\\[${expr}\\]`;
  }).join('\n');
}

export function finalizeTutorMath(text) {
  let s = String(text || '');
  s = mergeAdjacentInlineMath(s);
  s = wrapEquationChains(s);
  s = wrapBareLatexCommands(s);
  s = wrapStandaloneEquations(s);
  // Wrap simple superscripts into inline LaTeX before further merging so
  // merge logic treats them as math regions.
  s = wrapSimpleSuperscripts(s);
  s = mergeAdjacentInlineMath(s);
  // Simplify integer radical expressions like \sqrt{1184} -> 4\sqrt{74}
  s = simplifyIntegerSqrtExpressions(s);
  s = simplifyGeneralSqrtExpressions(s);
  s = fixUnmatchedDisplayDelimiters(s);
  // Apply conservative snippet-level normalizations (delimiter fixes and sqrt simplification)
  s = simplifyProblemSnippet(s);
  // Convert simple caret superscript tokens outside math into inline LaTeX
  // e.g. `a^2`, `28^2` -> `\(a^{2}\)`, `\(28^{2}\)`
  s = wrapSimpleSuperscripts(s);
  // Merge coefficient + partially wrapped sqrt tokens: 8\(\sqrt{6}\) -> \(8\sqrt{6}\)
  s = coalescePartialInlineMath(s);
  s = s.replace(
    /\\\((correct|incorrect)\)\^\{(\d+)\}\\\)\s*\.\s*(?=For the equation)/gi,
    '($1).\n\n$2. For the equation'
  );
  // Prettify step-by-step fragments by ensuring equation-like lines are
  // placed on their own lines and wrapped as display math for readability.
  s = prettifyStepByStep(s);
  // Wrap any remaining bare LaTeX-in-parens fragments missed by prose heuristics.
  s = wrapBareLatexParentheses(s);
  s = repairAlignedEnvironmentLineBreaks(s);
  return s;
}

function splitInlinedCalculations(text) {
  let s = String(text || '');
  // Put calculation steps on their own line after a clause marker.
  s = s.replace(/:\s*((?:\d+\([^)]*\)|\d+\(\d+\)\(\d+\))\s*=[^\n.]+)/g, ':\n$1');
  // Separate a trailing calculation from the next prose sentence.
  s = s.replace(
    /((?:\d+\([^)]*\)|\d+\(\d+\)\(\d+\))\s*=\s*(?:\d+|\\cdot[^A-Za-z\n]+|\d+\s*\\cdot\s*\d+)[^\n]*?)\s+(Add\b|Given\b|Substitute\b|Calculate\b|The\b)/gi,
    '$1\n$2'
  );
  return s;
}

// Wrap math fragments inside prose sentences with inline delimiters.
function inlineWrapMathInProseLine(line) {
  let s = String(line || '');

  // "Surface Area = <expr>" up to the next prose clause
  s = s.replace(
    /\b(Surface\s+Area)\s*=\s*([^.;]+?)(?=\s+(?:Given|Calculate|Substitute|Add\b)|[.;]|$)/gi,
    (_m, label, expr) => {
      const units = expr.match(/\s+(square\s+inches?|sq\.?\s*in\.?|cubic\s+inches?|cm\^?2?|units?)\s*$/i);
      const numExpr = units ? expr.slice(0, units.index).trim() : expr.trim();
      const unitSuffix = units ? ` ${units[1]}` : '';
      const repaired = repairCorruptLatexTokens(numExpr);
      return `${label} = \\(${stripMathDelimitersFromExpression(repaired)}\\)${unitSuffix}`;
    }
  );

  // Dimension assignments like "l = 4 inches"
  s = s.replace(
    /\b([lwh])\s*=\s*(\d+(?:\.\d+)?)\s*(inches|cm|mm|feet|ft|m|meters)?\b/gi,
    (_m, varName, val, unit) => {
      const unitPart = unit ? `\\text{ ${unit}}` : '';
      return `\\(${varName} = ${val}${unitPart}\\)`;
    }
  );

  // Circle standard form embedded in prose: (x-h)^2 +(y-k)^2 =r^2
  s = s.replace(
    /\(([xy])-([A-Za-z])\)\^(\d+)\s*\+\s*\(([xy])-([A-Za-z])\)\^(\d+)\s*=\s*([A-Za-z])\^(\d+)/g,
    (_m, x1, h, e1, x2, k, e2, r, e3) =>
      `\\((${x1}-${h})^{${e1}} + (${x2}-${k})^{${e2}} = ${r}^{${e3}}\\)`
  );

  // Standalone calculation equalities embedded in prose (e.g. totals at end of a sentence)
  s = s.replace(
    /(?<![\\(])(\d+(?:\s*\\cdot\s*\d+|\([^)]+\))(?:\s*\+\s*\d+(?:\s*\\cdot\s*\d+|\([^)]+\)))*\s*=\s*\d+)(?!\s*\((?:correct|incorrect)\))/g,
    (match) => `\\(${stripMathDelimitersFromExpression(match.trim())}\\)`
  );

  return s;
}

function isProseLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  const wordCount = (trimmed.match(/\b[a-zA-Z]{3,}\b/g) || []).length;
  return wordCount >= 4 || PROSE_LINE_WORDS.test(trimmed);
}

function isEquationLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || /\\\(|\\\[|\$\$/.test(trimmed)) return false;
  if (isProseLine(trimmed)) return false;
  if (isTutorPointCheckLine(trimmed)) return false;
  return /=|\^|\\sqrt|\\cdot|\\times/.test(trimmed) || /^\s*[A-Za-z]\s*=/.test(trimmed);
}

function extractAnswerChoicesBlock(text) {
  const match = String(text || '').match(/\n?\s*Answer choices:\s*([\s\S]*)$/i);
  if (!match) return { body: text, answerChoices: null };
  const candidate = match[1].trim();
  if (!isLikelyAnswerChoicesBlock(candidate)) return { body: text, answerChoices: null };
  const body = text.slice(0, match.index).trimEnd();
  return { body, answerChoices: candidate };
}

function coalescePartialInlineMath(text) {
  return applyOutsideMathRegions(String(text || ''), chunk =>
    chunk
      .replace(/(\d+)\\\((\\sqrt\{[^}]+\})\\\)/g, '\\($1$2\\)')
      .replace(/(\d+)\\\(([^()\\\n]+)\\\)/g, (_m, coef, inner) => {
        if (/\\cdot|\\times|[+\-]/.test(inner)) return `\\(${coef}(${inner})\\)`;
        return `\\(${coef}${inner}\\)`;
      })
  );
}

function collapseSplitAnswerChoiceText(rest) {
  let s = String(rest || '');
  s = repairSplitExponents(s);
  s = repairLinearEquationStructure(s);
  // Normalize pipe separators split across lines.
  s = s.replace(/\|\s*\n+\s*/g, ' | ');
  // Join coefficient/radicand pairs split across lines: "8\n6" -> "8 6".
  // Skip stacked fractions in linear equations like "2\n1\n x+3".
  s = s.replace(/(\b\d{1,2})\s*\n+\s*(\d{1,4}(?:\.\d+)?)\b(?!\s*\n*\s*x)/g, '$1 $2');
  // Join thousands split across tokens when a comma is present: "1,\n184" -> "1,184".
  s = s.replace(/(\b\d{1,3}),\s*\n+\s*(\d{3})\b/g, '$1,$2');
  // Collapse remaining newlines inside the choices block to spaces.
  s = s.replace(/\n+/g, ' ');
  // Merge inline split sqrt tokens before delimiter split.
  s = s.replace(/(\b\d{1,2})\s+(\d{1,4})(?=\s*(?:\||$))/g, (m, coef, rad) => {
    const c = Number(coef);
    const r = rad.replace(/,/g, '');
    if (coef === '1' && Number(r) >= 100) return `${coef}${r}`;
    if (c > 0 && c <= 20 && Number(r) >= 2) return `${coef}\\sqrt{${r}}`;
    return m;
  });
  return s.trim();
}

export function repairAnswerChoicesArray(choices) {
  if (!Array.isArray(choices)) return [];
  const cleaned = choices
    .map(c => String(c || '').trim())
    .filter(Boolean);
  const merged = [];
  let i = 0;
  while (i < cleaned.length) {
    const cur = cleaned[i];
    const next = cleaned[i + 1];
    if (/^\d{1,2}$/.test(cur) && next && /^\d{1,4}(?:\.\d+)?$/.test(next.replace(/,/g, ''))) {
      const rad = next.replace(/,/g, '');
      const c = Number(cur);
      if (cur === '1' && Number(rad) >= 100) {
        merged.push(`${cur}${rad}`);
        i += 2;
        continue;
      }
      if (c > 0 && c <= 20 && Number(rad) >= 2) {
        merged.push(`${cur}\\sqrt{${rad}}`);
        i += 2;
        continue;
      }
    }
    merged.push(cur);
    i += 1;
  }
  return merged;
}

export function solutionIncludesAnswerChoices(text) {
  return /Answer choices\s*:/i.test(String(text || ''));
}

export function formatAnswerChoicesForDisplay(choices) {
  const merged = repairAnswerChoicesArray(choices);
  return formatAnswerChoicesBlock(merged.join(' | '));
}

function repairAlignedEnvironmentLineBreaks(text) {
  return String(text || '').replace(
    /(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})/g,
    (block) => block.replace(/(?<!\\)\\(\r?\n)/g, '\\\\$1')
  );
}
function normalizeChoiceToken(token) {
  let t = coalescePartialInlineMath(wrapLinearEquations(repairTutorContent(String(token || '').trim())));
  if (!t) return t;
  if (/^\\\([\s\S]*\\\)$/.test(t) && !/\\\(/.test(t.slice(2, -2))) return t;

  const splitSqrt = t.match(/^([0-9]{1,3})[\s,]+([0-9]{1,4}(?:\.[0-9]+)?)$/);
  if (splitSqrt) {
    const g1 = splitSqrt[1].replace(/,/g, '');
    const g2 = splitSqrt[2].replace(/,/g, '');
    if ((g1.length <= 2 && g2.length >= 3 && Number(g1) <= 9) || (g1.length + g2.length > 3 && Number(g1) < 100 && Number(g2) >= 100)) {
      return `\\(${(g1 + g2).replace(/^0+/, '')}\\)`;
    }
    return `\\(${g1}\\sqrt{${g2}}\\)`;
  }

  if (/\\sqrt|\^|[A-Za-z]\^{|\([A-Za-z0-9\\]|[A-Za-z0-9]\s*\^|\by\s*=/.test(t)) {
    if (/^\\\(\s*y\s*=/.test(t)) return t.replace(/\by\s*=\s*/g, 'y=');
    const inner = stripMathDelimitersFromExpression(t)
      .replace(/([A-Za-z0-9()]+)\^\{?(\d+)\}?/g, '$1^{$2}')
      .replace(/\s+/g, ' ')
      .trim();
    return `\\(${inner}\\)`;
  }

  if (/^[0-9,]+$/.test(t)) return `\\(${t.replace(/,/g, '')}\\)`;
  return t;
}

function formatAnswerChoicesBlock(rest) {
  const collapsed = collapseSplitAnswerChoiceText(rest);
  const parts = collapsed.split(/\|/).map(p => p.trim()).filter(Boolean);
  const merged = repairAnswerChoicesArray(parts);
  return 'Answer choices: ' + merged.map(normalizeChoiceToken).join(' | ');
}

// Prettify step-by-step solution text: split into paragraphs, and wrap
// equation-like lines in display math (\[ ... \]) to improve readability.
export function prettifyStepByStep(text) {
  if (!text) return text;
  let s = String(text || '');

  const { body, answerChoices } = extractAnswerChoicesBlock(s);
  s = splitInlinedCalculations(body);

  // Normalize common 'Answer choices' marker to start a new paragraph.
  s = s.replace(/\s*Answer choices[:\s]/i, '\n\nAnswer choices: ');

  // Detect a common Pythagorean pattern and produce a clean formatted block
  // when a and b assignments and a^2 + b^2 appear. Strip math delimiters
  // for detection so wrapped content still matches.
  const detectTarget = s.replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g, ' ');
  const pa = detectTarget.match(/\b[aA]\s*=\s*(\d+(?:\.\d+)?)(?:\s*(cm|in|mm))?/);
  const pb = detectTarget.match(/\b[bB]\s*=\s*(\d+(?:\.\d+)?)(?:\s*(cm|in|mm))?/);
  // Be permissive: if `a=` and `b=` are present and there's evidence of
  // a Pythagorean relation (c, sqrt, or caret), format it specially.
  if (pa && pb && /\bc\b|\\sqrt|\^/i.test(detectTarget)) {
    const aVal = Number(pa[1]);
    const bVal = Number(pb[1]);
    const unit = (pa[2] || pb[2] || '').trim();
    const sum = Math.pow(aVal, 2) + Math.pow(bVal, 2);
    // Extract largest perfect-square factor
    let outside = 1;
    let rem = sum;
    for (let k = Math.floor(Math.sqrt(sum)); k >= 2; k--) {
      const sq = k * k;
      if (sum % sq === 0) { outside = k; rem = sum / sq; break; }
    }
    const unitText = unit ? `\\text{${unit}}` : '';
    const aligned = [];
    aligned.push(`\\[\\begin{aligned}`);
    aligned.push(`a &= ${aVal}${unitText}, & b &= ${bVal}${unitText},\\\\`);
    aligned.push(`a^2 + b^2 &= c^2,\\\\`);
    aligned.push(`${aVal}^2 + ${bVal}^2 &= c^2,\\\\`);
    aligned.push(`${Math.pow(aVal,2)} + ${Math.pow(bVal,2)} &= c^2,\\\\`);
    aligned.push(`${sum} &= c^2,\\\\`);
    if (outside > 1) {
      aligned.push(`c &= \\sqrt{${sum}} = \\sqrt{${outside*outside}\\cdot ${rem}} = ${outside}\\sqrt{${rem}}`);
    } else {
      aligned.push(`c &= \\sqrt{${sum}}`);
    }
    aligned.push('\\end{aligned}\\]');
    const answerBlock = answerChoices ? '\n\n' + formatAnswerChoicesBlock(answerChoices) : '';
    return aligned.join('\n') + answerBlock;
  }

  // Split into blocks by blank lines and trim
  const blocks = s.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  const processed = blocks.map(block => {
    // If block already contains explicit display delimiters, leave as-is
    if (/\\\[|\$\$/.test(block)) return block;

    // Split single block into lines, process each line
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    const outLines = lines.map(line => {
      if (/^\\\[[\s\S]*\\\]$/.test(line.trim())) return line;
      if (/\\\(|\\\[|\$\$/.test(line)) return line;

      if (isProseLine(line)) {
        return inlineWrapMathInProseLine(line);
      }

      if (isEquationLine(line)) {
        const expr = stripMathDelimitersFromExpression(line);
        return `\\[${expr}\\]`;
      }

      return line;
    });

    // Join lines with one blank line to improve readability
    return outLines.join('\n\n');
  });

  let result = processed.join('\n\n');

  // Ensure adjacent math regions are separated so they don't glue together
  // e.g. \)\(  -> \) \( and add newlines when a closing delimiter is
  // immediately followed by a digit or letter: "\)28" -> "\)\n28".
  result = result.replace(/\\\)\\\(/g, '\\) \\(');
  result = result.replace(/\\\]\\\(/g, '\\] \\(');
  result = result.replace(/\\\)(?=[0-9A-Za-z\\\[])/g, '\\)\n');
  result = result.replace(/\\\](?=[0-9A-Za-z\\\[])/g, '\\]\n');

  // Cleanup common broken fragments introduced earlier in pipeline
  // remove stray "\b" tokens that aren't part of commands like "\\begin".
  result = result.replace(/\\b(?![A-Za-z])/g, '');
  // repair broken '\text' fragments like '\   ext{'
  result = result.replace(/\\\s*ext\{/g, '\\text{');

  // Dedupe chained equality expressions where the last term repeats an
  // earlier term, e.g. "x = y = z = y" -> "x = y = z" (remove adjacent duplicates)
  result = result.split('\n').map(line => {
    if (!line.includes('=')) return line;
    if (isTutorPointCheckLine(line) || /\bWhen x\s*=/i.test(line)) return line;
    const parts = line.split('=');
    const clean = [];
    const norm = s => String(s || '').replace(/[\\()\[\]\s]/g, '');
    for (let p of parts) {
      const t = p.trim();
      if (!t) continue;
      if (clean.length === 0) { clean.push(t); continue; }
      if (norm(clean[clean.length - 1]) === norm(t)) continue;
      clean.push(t);
    }
    return clean.join(' = ');
  }).join('\n');

  // Normalize Answer choices block into single inline line with cleaned items
  if (answerChoices) {
    result = result.trimEnd() + '\n\n' + formatAnswerChoicesBlock(answerChoices);
  } else {
    result = result.replace(/Answer choices:\s*([\s\S]*)$/i, (_m, rest) => formatAnswerChoicesBlock(rest));
  }

  return result;
}

// Wrap simple superscript expressions outside protected math regions.
export function wrapSimpleSuperscripts(text) {
  if (!text) return text;
  let s = applyOutsideMathRegions(String(text), chunk =>
    chunk.replace(/(\((?!correct|incorrect)[^)]+\))\^(\d+)/g, '\\($1^{$2}\\)'));
  s = applyOutsideMathRegions(s, chunk =>
    chunk.replace(/(^|[^A-Za-z0-9\\-])([A-Za-z0-9()]+)\^\{?(\d+)\}?(?=[^A-Za-z0-9\\]|$)/g,
      (_m, lead, base, exp) => `${lead}\\(${base}^{${exp}}\\)`));
  return s;
}

export function sanitizeHintText(text) {
  return sanitizeTutorText(text).replace(/^Hint\s*\d+\s*:\s*/i, '').trim();
}

export function cleanupTutorMarkdown(value) {
  return repairTutorContent(value)
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+\*\*([^*\n]+):\*\*/gm, '$1:')
    .replace(/([A-Za-z0-9)])\s*\n\s*(\d+)\s*\n\s*(?=[-+−])/g, '$1^{$2} ')
    .replace(/([A-Za-z0-9)])\s*\n\s*(\d+)(?=\s*[-+−])/g, '$1^{$2}');
}

function applyOutsideMathRegions(text, transform) {
  const { out, regions } = protectMathRegions(String(text || ''));
  return restoreMathRegions(transform(out), regions);
}

function wrapBareLatexParentheses(text) {
  return applyOutsideMathRegions(String(text || ''), chunk => chunk
    .replace(/\(\(([^()\n]*)\)\)/g, (_m, inner) => `\\((${inner})\\)`)
    .replace(/(\d+)\(([^()\n]*\\[a-zA-Z][^()]*)\)/g, (_m, coef, inner) => `\\(${coef}(${inner})\\)`)
    .replace(/(?<!\\)(?<!\d)\(([^()\n]*?)\)(?!\))/g, (m, inner) => (
      /\\[a-zA-Z]/.test(inner) ? `\\(${inner}\\)` : m
    ))
  );
}

export function normalizeMathDelimiters(text) {
  if (!text) return text;
  let out = cleanupTutorMarkdown(text);

  out = out.replace(/\\\\\(/g, '\\(');
  out = out.replace(/\\\\\)/g, '\\)');
  out = out.replace(/\\\\\[/g, '\\[');
  out = out.replace(/\\\\\]/g, '\\]');

  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner) => {
    return `$$${stripMathDelimitersFromExpression(inner)}$$`;
  });
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => {
    return `\\[${stripMathDelimitersFromExpression(inner)}\\]`;
  });
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => {
    return `\\(${stripMathDelimitersFromExpression(inner)}\\)`;
  });

  out = applyOutsideMathRegions(out, chunk => chunk
    .replace(/(?<!\\)\[([^[\]\n]*?)\](?!\])/g, (m, inner) => (
      /\\[a-zA-Z]/.test(inner) ? `\\[${inner}\\]` : m
    ))
  );
  out = wrapBareLatexParentheses(out);

  return finalizeTutorMath(out);
}

export function cleanLatex(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = repairLatexEscapeDamage(raw).trim();

  s = s.replace(/```latex|```/g, '').trim();

  s = s
    .replace(/×/g, '\\times ')
    .replace(/÷/g, '\\div ')
    .replace(/−/g, '-')
    .replace(/–/g, '-')
    .replace(/\u2212/g, '-')
    .replace(/≤/g, '\\leq ')
    .replace(/≥/g, '\\geq ')
    .replace(/≠/g, '\\neq ')
    .replace(/π/g, '\\pi ')
    .replace(/√/g, '\\sqrt')
    .replace(/²/g, '^{2}')
    .replace(/³/g, '^{3}');

  s = s
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\\\[/g, '')
    .replace(/\\\]/g, '')
    .replace(/\$\$/g, '')
    .replace(/\$(?!\d)/g, '');

  s = repairCorruptLatexTokens(s);
  s = s.replace(/\^(\d+)/g, '^{$1}');
  s = s.replace(/\\sqrt\s+([A-Za-z0-9])/g, '\\sqrt{$1}');
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');
  s = s.replace(/\{\s+/g, '{').replace(/\s+\}/g, '}');

  const openBraces = (s.match(/(?<!\\)\{/g) || []).length;
  const closeBraces = (s.match(/(?<!\\)\}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 2) {
    s = `${s} [latex-unbalanced]`;
  }

  return s;
}

export function isProseNotLatex(value) {
  const s = String(value || '').trim();
  if (!s) return true;

  const hasLatexCommand = /\\(?:frac|sqrt|leq|geq|neq|times|div|cdot|text|begin|triangle|angle|circ)/.test(s);
  const hasEquationShape = /(?:V|f|g|h|P)\s*\([^)]+\)\s*=/.test(s) || /^[A-Za-z0-9\\()+\-*/^_{}\s.]{1,80}=[^=]{1,80}$/.test(s);
  if (hasLatexCommand && hasEquationShape && s.length < 120) return false;
  if (hasEquationShape && s.length < 60 && !/\b(which|figure|shown|prism|triangle|inches|function)\b/i.test(s)) {
    return false;
  }

  const longWords = s.match(/[a-zA-Z]{5,}/g) || [];
  const gluedWords = longWords.filter(word => !/[A-Z]/.test(word.slice(1)) && word.length > 8);
  const spaceRatio = (s.match(/\s/g) || []).length / Math.max(s.length, 1);

  if (gluedWords.length >= 2 && spaceRatio < 0.1) return true;
  if (s.length > 80 && spaceRatio < 0.08) return true;
  if (/\b(which function|figure shown|right rectangular|similar to|in terms of)\b/i.test(s)) return true;

  const mathMarkers = (s.match(/[=^_{}\\]/g) || []).length;
  const alphaChars = (s.match(/[a-zA-Z]/g) || []).length;
  return alphaChars > 40 && mathMarkers < 4 && !hasEquationShape;
}

export function sanitizeLatexClean(raw, questionText = '') {
  if (!raw) return '';
  let s = cleanLatex(String(raw).trim());
  if (!s) return '';

  const normalizedQuestion = normalizeProseSpacing(questionText);
  const normalizedLatex = normalizeProseSpacing(s.replace(/\\[a-zA-Z]+/g, ' $& '));

  if (
    isProseNotLatex(s) ||
    (normalizedQuestion && normalizedLatex.replace(/\s/g, '') === normalizedQuestion.replace(/\s/g, ''))
  ) {
    const formulas = s.match(/(?:V|f|g|h|P)\s*\([^)]+\)\s*=\s*[\w()+\-*/^\\{}.\s]{2,60}/g);
    if (formulas?.length) return cleanLatex(formulas[0].trim());
    return '';
  }

  return s;
}

export function detectLatexIssues(latex) {
  const issues = [];
  if (!latex) return issues;
  if (latex.includes('[latex-unbalanced]')) issues.push('unbalanced braces');
  if (/\\\w+\s*$/.test(latex)) issues.push('trailing incomplete command');
  if (/\\frac\{[^}]*\}\s*$/.test(latex)) issues.push('incomplete fraction');
  if (/\^\s*$/.test(latex)) issues.push('dangling exponent');
  if (/\\t\\text|\\tfrac|\\tpi|\\theight|\\tradius/.test(latex)) issues.push('tab-corrupted command');
  return issues;
}
