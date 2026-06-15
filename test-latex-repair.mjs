import {
  sanitizeTutorText,
  normalizeMathDelimiters,
  repairCorruptLatexTokens,
  repairLatexEscapeDamage,
  repairAnswerChoicesArray,
  formatAnswerChoicesForDisplay,
} from './latexRepair.js';

const cases = [
  {
    name: 'probability tab corruption',
    input: 'P\\(\\t\\text{Red}\\) = \\frac{\\t\\text{Number of red tiles}}{\\t\\text{Total number of tiles}} = \\frac{30}{100}',
    mustInclude: ['\\(P(\\text{Red})', '\\frac{\\text{Number of red tiles}}', '\\frac{30}{100}'],
    mustNotInclude: ['\\t\\text', '\\t\\frac'],
  },
  {
    name: 'full tutor solution snippet',
    input: 'P\\(\\t\\text{Red}\\) = \\frac{\\t\\text{Number of red tiles}}{\\t\\text{Total number of tiles}} = \\frac{30}{100} Simplify the fraction or convert it to a decimal:\nP\\(\\t\\text{Red}\\) = \\frac{30}{100} = 0.3 Therefore, the probability of selecting a red tile is 0.3 or 3/10.',
    mustInclude: ['\\(P(\\text{Red})', '\\frac{30}{100}', '0.3', '\\(\\frac{3}{10}\\)'],
    mustNotInclude: ['\\t\\text'],
  },
  {
    name: 'plain fraction',
    input: 'Therefore, the probability is 0.3 or 3/10.',
    mustInclude: ['\\(\\frac{3}{10}\\)'],
  },
  {
    name: 'stacked fraction after or',
    input: 'Therefore, the probability is 0.3 or\n3\n10.',
    mustInclude: ['\\(\\frac{3}{10}\\)'],
  },
  {
    name: 'tab escape damage in text command',
    input: 'P(\u0009ext{Red}) = \u000crac{30}{100}',
    mustInclude: ['\\text{Red}', '\\frac{30}{100}'],
  },
  {
    name: 'merge split inline math',
    input: '\\(P(\\text{Red})\\) = \\( \\frac{30}{100} \\)',
    mustInclude: ['\\(P(\\text{Red}) = \\frac{30}{100}\\)'],
  },
  {
    name: 'cylinder corruption tokens',
    input: 'Volume is \\pi r^2 \\theight_A with \\tradius_B',
    mustInclude: ['h_A', 'r_B'],
    mustNotInclude: ['\\theight', '\\tradius'],
  },
  {
    name: 'surface area glued coefficient corruption',
    input: 'Surface Area=2 4⋅5 + 24⋅6 + 25⋅6',
    mustInclude: ['2(4 \\cdot 5 + 4 \\cdot 6 + 5 \\cdot 6)'],
    mustNotInclude: ['24⋅5', '24⋅6', '25⋅6', '2 4⋅5', '2(4)(5)'],
  },
  {
    name: 'multiline split answer choices',
    input: 'Answer choices:\n8\n6\n|\n4\n74\n| 48 | 1, 184',
    mustInclude: ['\\(8\\sqrt{6}\\)', '\\(4\\sqrt{74}\\)', '\\(48\\)', '\\(1184\\)'],
    mustNotInclude: ['8 | 6 | 4 | 74'],
  },
  {
    name: 'split answer choices array repair',
    input: 'Answer choices: 8 | 6 | 4 | 74 | 48 | 1184',
    mustInclude: ['\\(8\\sqrt{6}\\)', '\\(4\\sqrt{74}\\)', '\\(48\\)', '\\(1184\\)'],
  },
  {
    name: 'repair answer choices array helper',
    input: '',
    repairFn: () => formatAnswerChoicesForDisplay(repairAnswerChoicesArray(['8', '6', '4', '74', '48', '1, 184'])),
    mustInclude: ['\\(8\\sqrt{6}\\)', '\\(4\\sqrt{74}\\)', '\\(48\\)', '\\(1184\\)'],
  },
  {
    name: 'pythagorean aligned block preserves answer choices',
    input: 'a = 28, b = 20, a^2 + b^2 = c^2, 1184 = c^2, c = 4\\sqrt{74}\nAnswer choices: 8\\sqrt{6} | 4\\sqrt{74} | 48 | 1184',
    mustInclude: ['\\begin{aligned}', '4\\sqrt{74}', 'Answer choices:', '\\(8\\sqrt{6}\\)', '\\(48\\)'],
    mustNotInclude: ['8\\(\\sqrt{6}\\)'],
  },
  {
    name: 'bare sqrt digits and split coefficient line',
    input: 'c = 4\n\\sqrt{74}\nAnswer choices: 8\\sqrt6 | 4\\sqrt 74',
    mustInclude: ['4\\sqrt{74}', '\\(8\\sqrt{6}\\)', '\\(4\\sqrt{74}\\)'],
  },
  {
    name: 'partial inline math coalescing for choices',
    input: 'Answer choices: 8\\(\\sqrt{6}\\) | 4\\(\\sqrt{74}\\) | 48',
    mustInclude: ['\\(8\\sqrt{6}\\)', '\\(4\\sqrt{74}\\)', '\\(48\\)'],
    mustNotInclude: ['8\\(\\sqrt{6}\\)'],
  },
];

let failed = 0;
for (const tc of cases) {
  const repaired = tc.repairFn ? tc.repairFn() : sanitizeTutorText(tc.input);
  const display = tc.repairFn ? repaired : normalizeMathDelimiters(repaired);
  const hay = `${repaired}\n${display}`;
  const misses = (tc.mustInclude || []).filter(x => !hay.includes(x));
  const bad = (tc.mustNotInclude || []).filter(x => hay.includes(x));
  if (misses.length || bad.length) {
    failed += 1;
    console.error(`FAIL: ${tc.name}`);
    console.error('  input:', tc.input);
    console.error('  output:', display);
    if (misses.length) console.error('  missing:', misses);
    if (bad.length) console.error('  should not include:', bad);
  } else {
    console.log(`OK: ${tc.name}`);
  }
}

process.exit(failed ? 1 : 0);
