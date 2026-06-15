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
    name: 'surface area glued corruption with latex cdot',
    input: 'Surface Area=2 4\\cdot 5 + 24\\cdot 6 + 25\\cdot 6',
    mustInclude: ['2(4 \\cdot 5 + 4 \\cdot 6 + 5 \\cdot 6)'],
    mustNotInclude: ['24\\cdot 5', '2 4\\cdot 5'],
  },
  {
    name: 'step breakdown converts unicode and wraps cdot arithmetic',
    input: 'Substitute these values into the formula: Surface Area=2(4 \\cdot 5) + 2(4 \\cdot 6) + 2(5 \\cdot 6) Calculate each term separately:\n2(4⋅5)=2⋅20=40\n2(4⋅6)=2⋅24=48\n2(5⋅6)=2⋅30=60',
    mustInclude: ['\\(2(4 \\cdot 5) + 2(4 \\cdot 6) + 2(5 \\cdot 6)\\)', '\\cdot 5', '\\cdot 20'],
    mustNotInclude: ['⋅', '2(4⋅5)'],
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
    name: 'normalizeMathDelimiters preserves surface area grouping',
    input: 'Surface Area=2 4⋅5 + 24⋅6 + 25⋅6 Calculate each term',
    repairFn: () => normalizeMathDelimiters('Surface Area=2 4⋅5 + 24⋅6 + 25⋅6 Calculate each term'),
    mustInclude: ['\\(2(4 \\cdot 5 + 4 \\cdot 6 + 5 \\cdot 6)\\)'],
    mustNotInclude: ['2\\(4 \\cdot 5', '24⋅6'],
  },
  {
    name: 'partial inline math coalescing for choices',
    input: 'Answer choices: 8\\(\\sqrt{6}\\) | 4\\(\\sqrt{74}\\) | 48',
    mustInclude: ['\\(8\\sqrt{6}\\)', '\\(4\\sqrt{74}\\)', '\\(48\\)'],
    mustNotInclude: ['8\\(\\sqrt{6}\\)'],
  },
  {
    name: 'repair split exponents on newlines',
    input: '6 x\n8\n y\n2\n + 12 x\n2\n y\n2',
    mustInclude: ['\\(x^{8}\\)', '\\(y^{2}\\)', '\\(x^{2}\\)'],
    mustNotInclude: ['x\n8', 'y\n2'],
  },
  {
    name: 'preserve hint counter fraction',
    input: '💡 Hint 1/3: Factor out the greatest common factor',
    mustInclude: ['Hint 1/3:'],
    mustNotInclude: ['\\frac{1}{3}'],
  },
  {
    name: 'preserve contractions in prose spacing',
    input: "That's all the hints! Try 'Solution' if you're still stuck.",
    mustInclude: ["That's", "you're", "'Solution'"],
    mustNotInclude: ["That 's", "you 're", "Solution '"],
  },
  {
    name: 'factor expression answer choices',
    input: '',
    repairFn: () => formatAnswerChoicesForDisplay([
      '6 x^2 y\n2\n (2 x\n6\n )',
      '6 x^2 y^2 (x^6 + 2)',
    ]),
    mustInclude: ['\\(6 x^{2} y^{2} (2 x^{6} )\\)', '\\(6 x^{2} y^{2} (x^{6} + 2)\\)'],
    mustNotInclude: ['y\n2', 'x\n6', '\\(x^{2}\\) \\(y^{2}\\)'],
  },
  {
    name: 'equivalent expression question with exponents',
    input: 'Which expression is equivalent to 6 x\n8\n y\n2\n + 12 x\n2\n y\n2 ?',
    mustInclude: ['\\(x^{8}\\)', '\\(y^{2}\\)', '\\(x^{2}\\)'],
    mustNotInclude: ['x\n8', 'y\n2'],
  },
  {
    name: 'table probability glued solution with stacked fractions',
    input: '',
    repairFn: () => sanitizeTutorText(`Answer choices: toguideoursolution):−Studentswhodidnotbuyfoodanddidnotparticipateingames:55−Studentswhodidnotbuyfoodbutparticipatedingames:80Thetotalnumberofstudentswhodidnotbuyfoodis55+80=135.P(did not buy food)= \n300\n135\nSimplifythefraction: \n300\n135\n = \n20\n9\nTherefore,theprobabilitythatastudentselectedatrandomdidnotbuyfoodis \n300\n135`),
    mustInclude: [
      'Given values:',
      'Students who did not buy food and did not participate in games',
      'The total number of students who did not buy food is',
      '\\(\\frac{135}{300}\\)',
      '\\frac{9}{20}',
    ],
    mustNotInclude: [
      'Answer choices: toguide',
      'Studentswhodidnotbuyfood',
      '203\\sqrt',
      '300, 135',
    ],
  },
  {
    name: 'linear equation choices and similar tutor response',
    input: '',
    repairFn: () => {
      const choices = formatAnswerChoicesForDisplay(['y=2x+1', 'y=−x+4', 'y= \n2\n1\n x+3', 'y=3x−2']);
      const tutor = sanitizeTutorText("y=3x−2Let ssolvethisstep−by−step.First,letsusethepointsfromthetabletotesteachequation.Table:(0,4),(2,6)Substitutethesepointsintoeachequationandseewhichonefitsbothpairs.Whichequationwouldyouliketotryfirst");
      return `${choices}\n${tutor}`;
    },
    mustInclude: [
      '\\(y=2x+1\\)',
      '\\(y=-x+4\\)',
      '\\(y=\\frac{1}{2}x+3\\)',
      "Let's solve this step-by-step",
      'Which equation would you like to try first',
      'Table: (0, 4), (2, 6) Substitute',
    ],
    mustNotInclude: ['21x+3', 'y=3x−2Let', 'Letsolvethisstep'],
  },
  {
    name: 'circle equation similar question with stacked exponents',
    input: '',
    repairFn: () => sanitizeTutorText(
      "Sure! Here's a new practice problem for you:\n9x \n2\n +9y \n2\n −18x+6y=30\nWhat is the diameter of the circle described by this equation? ### Key Equations (La Te X):\n9x \n2\n +9y \n2\n −18x+6y=30\n### Test-Taking Strategy:\nUse completing the square to get (x−h) \n2\n +(y−k) \n2\n =r \n2\n ."
    ),
    mustInclude: [
      '9x^2 +9y^2 -18x+6y = 30',
      'Key Equations (LaTeX)',
      '\\((x-h)^{2} + (y-k)^{2} = r^{2}\\)',
    ],
    mustNotInclude: ['La Te X', '9x \n2', '(x-\\(h)', '21x+3'],
  },
  {
    name: 'linear equation point-check glued prose',
    input: '',
    repairFn: () => sanitizeTutorText(
      "1. For the equation y = x + 3:\n−Whenx=1,y=1+3=4(correct)\n- When x = 3, y = 3 + 3 = 6 (incorrect) \n2\n . For the equation y = 3x - 1:\n−Whenx=1,y=3(1)−1=2(incorrect)\n−Whenx=3,y=2(3)=6(incorrect)Noneof\n\nthe equations fit all the points. How ever, the correct equation is y=3x−1.\n\nAnswer choices: y=x+3 | y=3x−1 | y=3x | y=2x"
    ),
    mustInclude: [
      'When x=1, y=1+3=4 (correct)',
      '2. For the equation y = 3x - 1',
      'None of the equations fit all the points',
      'However',
      '\\(y=3x-1\\)',
      '\\(y=x+3\\)',
    ],
    mustNotInclude: ['Whenx=', 'Noneof', 'How ever', '(incorrect)^{2}', '21x+3'],
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
