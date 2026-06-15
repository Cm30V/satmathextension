export const SAT_MATH_CATEGORIES = [
  'Linear equations in one variable',
  'Linear functions',
  'Linear equations in two variables',
  'Systems of two linear equations in two variables',
  'Linear inequalities in one or two variables',
  'Nonlinear functions',
  'Nonlinear equations in one variable and systems of equations in two variables',
  'Equivalent expressions',
  'Ratios, rates, proportional relationships, and units',
  'Percentages',
  'One-variable data: Distributions and measures of center and spread',
  'Two-variable data: Models and scatterplots',
  'Probability and conditional probability',
  'Inference from sample statistics and margin of error',
  'Evaluating statistical claims: Observational studies and experiments',
  'Area and volume',
  'Lines, angles, and triangles',
  'Right triangles and trigonometry',
  'Circles'
];

export const CATEGORY_UNIT_SLUGS = {
  'Linear equations in one variable': 'solving-linear-equations-and-linear-inequalities',
  'Linear functions': 'graphs-of-linear-equations-and-functions',
  'Linear equations in two variables': 'linear-equation-word-problems',
  'Systems of two linear equations in two variables': 'solving-systems-of-linear-equations',
  'Linear inequalities in one or two variables': 'graphs-of-linear-systems-and-inequalities',
  'Nonlinear functions': 'polynomial-and-other-nonlinear-graphs',
  'Nonlinear equations in one variable and systems of equations in two variables': 'solving-quadratic-equations',
  'Equivalent expressions': 'operations-with-polynomials',
  'Ratios, rates, proportional relationships, and units': 'ratios-rates-and-proportions',
  'Percentages': 'percentages',
  'One-variable data: Distributions and measures of center and spread': 'center-spread-and-shape-of-distributions',
  'Two-variable data: Models and scatterplots': 'scatterplots',
  'Probability and conditional probability': 'probability-and-relative-frequency',
  'Inference from sample statistics and margin of error': 'data-inferences',
  'Evaluating statistical claims: Observational studies and experiments': 'evaluating-statistical-claims',
  'Area and volume': 'area-and-volume',
  'Lines, angles, and triangles': 'congruence-similarity-and-angle-relationships',
  'Right triangles and trigonometry': 'right-triangle-trigonometry',
  'Circles': 'circle-theorems'
};

export const CATEGORY_TO_BROAD_TOPIC = {
  'Linear equations in one variable': 'Algebra',
  'Linear functions': 'Algebra',
  'Linear equations in two variables': 'Algebra',
  'Systems of two linear equations in two variables': 'Algebra',
  'Linear inequalities in one or two variables': 'Algebra',
  'Nonlinear functions': 'Advanced Math',
  'Nonlinear equations in one variable and systems of equations in two variables': 'Advanced Math',
  'Equivalent expressions': 'Advanced Math',
  'Ratios, rates, proportional relationships, and units': 'Problem Solving',
  'Percentages': 'Problem Solving',
  'One-variable data: Distributions and measures of center and spread': 'Data Analysis',
  'Two-variable data: Models and scatterplots': 'Data Analysis',
  'Probability and conditional probability': 'Data Analysis',
  'Inference from sample statistics and margin of error': 'Data Analysis',
  'Evaluating statistical claims: Observational studies and experiments': 'Data Analysis',
  'Area and volume': 'Geometry',
  'Lines, angles, and triangles': 'Geometry',
  'Right triangles and trigonometry': 'Geometry',
  'Circles': 'Geometry'
};

export function normalizeSatCategory(value) {
  const raw = String(value || '').trim();
  if (!raw) return SAT_MATH_CATEGORIES[0];

  const exact = SAT_MATH_CATEGORIES.find(
    category => category.toLowerCase() === raw.toLowerCase()
  );
  if (exact) return exact;

  const partial = SAT_MATH_CATEGORIES.find(category => {
    const left = category.toLowerCase();
    const right = raw.toLowerCase();
    return left.includes(right) || right.includes(left.slice(0, 24));
  });
  return partial || SAT_MATH_CATEGORIES[0];
}

export function broadTopicFromCategory(category) {
  return CATEGORY_TO_BROAD_TOPIC[normalizeSatCategory(category)] || 'Problem Solving';
}

export function difficultyTier(difficulty) {
  if (difficulty === 'Easy') return 'easier';
  if (difficulty === 'Hard') return 'harder';
  return 'medium';
}

export const CATEGORY_PRACTICE_LINKS = {
  'Linear equations in one variable': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:algebra-medium/x0fcc98a58ba3bea7:solving-linear-equations-and-linear-inequalities-medium/a/v2-sat-lesson-solving-linear-equations-and-inequalities',
  'Linear functions': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:algebra-medium/x0fcc98a58ba3bea7:graphs-of-linear-equations-and-functions-medium/a/v2-sat-lesson-graphs-of-linear-equations-and-functions',
  'Linear equations in two variables': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:algebra-medium/x0fcc98a58ba3bea7:linear-equation-word-problems-medium/a/v2-sat-lesson-understanding-linear-relationships',
  'Systems of two linear equations in two variables': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:algebra-medium/x0fcc98a58ba3bea7:solving-systems-of-linear-equations-medium/a/v2-sat-lesson-solving-systems-of-linear-equations',
  'Linear inequalities in one or two variables': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:algebra-medium/x0fcc98a58ba3bea7:graphs-of-linear-systems-and-inequalities-medium/a/v2-sat-lesson-graphs-of-linear-systems-and-inequalities',
  'Nonlinear functions': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:advanced-math-medium/x0fcc98a58ba3bea7:polynomial-and-other-nonlinear-graphs-medium/a/v2-sat-lesson-polynomial-and-other-nonlinear-graphs',
  'Nonlinear equations in one variable and systems of equations in two variables': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:advanced-math-medium/x0fcc98a58ba3bea7:solving-quadratic-equations-medium/a/v2-sat-lesson-solving-quadratic-equations',
  'Equivalent expressions': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:advanced-math-medium/x0fcc98a58ba3bea7:operations-with-polynomials-medium/a/v2-sat-lesson-operations-with-polynomials',
  'Ratios, rates, proportional relationships, and units': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:problem-solving-and-data-analysis-medium/x0fcc98a58ba3bea7:ratios-rates-and-proportions-medium/a/v2-sat-lesson-ratios-rates-and-proportions',
  'Percentages': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:problem-solving-and-data-analysis-medium/x0fcc98a58ba3bea7:percentages-medium/a/v2-sat-lesson-percentages',
  'One-variable data: Distributions and measures of center and spread': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:problem-solving-and-data-analysis-medium/x0fcc98a58ba3bea7:center-spread-and-shape-of-distributions-medium/a/v2-sat-lesson-center-spread-and-shape-of-distributions',
  'Two-variable data: Models and scatterplots': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:problem-solving-and-data-analysis-medium/x0fcc98a58ba3bea7:scatterplots-medium/a/v2-sat-lesson-scatterplots',
  'Probability and conditional probability': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:problem-solving-and-data-analysis-medium/x0fcc98a58ba3bea7:probability-and-relative-frequency-medium/a/v2-sat-lesson-probability-and-relative-frequency',
  'Inference from sample statistics and margin of error': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:problem-solving-and-data-analysis-medium/x0fcc98a58ba3bea7:data-inferences-medium/a/v2-sat-lesson-data-inferences',
  'Evaluating statistical claims: Observational studies and experiments': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:problem-solving-and-data-analysis-medium/x0fcc98a58ba3bea7:evaluating-statistical-claims-medium/a/v2-sat-lesson-evaluating-statistical-claims',
  'Area and volume': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:geometry-and-trigonometry-medium/x0fcc98a58ba3bea7:area-and-volume-medium/a/v2-sat-lesson-area-and-volume',
  'Lines, angles, and triangles': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:geometry-and-trigonometry-medium/x0fcc98a58ba3bea7:congruence-similarity-and-angle-relationships-medium/a/v2-sat-lesson-congruence-similarity-and-angle-relationships',
  'Right triangles and trigonometry': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:geometry-and-trigonometry-medium/x0fcc98a58ba3bea7:right-triangle-trigonometry-medium/a/v2-sat-lesson-right-triangle-trigonometry',
  'Circles': 'https://www.khanacademy.org/test-prep/v2-sat-math/x0fcc98a58ba3bea7:geometry-and-trigonometry-medium/x0fcc98a58ba3bea7:circle-theorems-medium/a/v2-sat-lesson-circle-theorems'
};

export function buildCategoryLinkMap(links, difficulty = 'Medium') {
  const tier = difficultyTier(difficulty);
  const map = {};

  for (const category of SAT_MATH_CATEGORIES) {
    const slug = `${CATEGORY_UNIT_SLUGS[category]}-${tier}`;
    const lesson = links.find(item =>
      item.type === 'dom' &&
      item.url.includes(`:${slug}/`) &&
      item.url.includes('/a/v2-sat-lesson')
    );
    const unitRoot = links.find(item =>
      item.type === 'dom' && item.url.endsWith(`:${slug}`)
    );
    map[category] = lesson?.url || unitRoot?.url || CATEGORY_PRACTICE_LINKS[category] || null;
  }

  return map;
}
