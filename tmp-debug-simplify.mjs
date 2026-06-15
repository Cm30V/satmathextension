import { sanitizeTutorText, normalizeMathDelimiters } from './latexRepair.js';

const input = String.raw`\[ a = 28 \(\text{ cm}\), b = 20 \(\text{ cm}\) \[ a^2 + b^2 = c^2 \[ 28^2 + 20^2 = c^2 \[ 784 + 400 = c^2 \[ 1184 = c^2 \[ c = \(4\\sqrt{74}\) \[ c = \(\\sqrt{64 \\times 18.5}\) \[ c = 8\\(\\sqrt{18.5}\\) \[ c = 8\\(\\sqrt{74}\\) \\(\\text{ (simplified)}\\)`;

console.log('INPUT:\n', input);
const repaired = sanitizeTutorText(input);
console.log('\nREPAIRED:\n', repaired);
console.log('\nNORMALIZED DELIMITERS OUTPUT:\n', normalizeMathDelimiters(repaired));
