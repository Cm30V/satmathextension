import * as repair from './latexRepair.js';

const surface = `The surface area of a right rectangular prism can be calculated using the formula: Surface Area=2 lw + 2 lh + 2 wh Given the dimensions: l = 4 inches, w = 5 inches, h = 6 inches. Substitute these values into the formula: Surface Area=24×5 + 24×6 + 25×6 Calculate each term separately: 24×5 = 2 \\times 20 = 40
24×6 = 2 \\times 24 = 48
25×6 = 2 \\times 30 = 60 Add these values together to find the total surface area: Surface Area=40 + 48 + 60 = 148 square inches Answer choices: 30 | 74 | 120 | 148`;

const pyth = `Step-by-Step Breakdown: a = 28  cm, b = 20  cm
a^2 + b^2 = c^2
28^2 + 20^2 = c^2
784 + 400 = c^2
1184 = c^2
c = 4
74

c = 8
18.5

c = 8
18.5

c = 8
74

(simplified)
Answer choices:
8
6
|
4
74
| 48 | 1, 184`;

console.log('--- SURFACE INPUT ---\n', surface, '\n');
const sOut = repair.sanitizeTutorText(surface);
console.log('SANITIZED SURFACE:\n', sOut, '\n');
console.log('NORMALIZED SURFACE:\n', repair.normalizeMathDelimiters(sOut), '\n');

console.log('--- PYTH INPUT ---\n', pyth, '\n');
const pOut = repair.sanitizeTutorText(pyth);
console.log('SANITIZED PYTH:\n', pOut, '\n');
console.log('NORMALIZED PYTH:\n', repair.normalizeMathDelimiters(pOut), '\n');
