export const GAME_DURATION_SECONDS = 120;

export type MentalMathOperator = "+" | "−" | "×" | "÷";
export type MentalMathOperation = "addition" | "subtraction" | "multiplication" | "division";

export interface NumberRange {
  min: number;
  max: number;
}

export interface MentalMathOptions {
  operations: MentalMathOperation[];
  additionLeft: NumberRange;
  additionRight: NumberRange;
  multiplicationLeft: NumberRange;
  multiplicationRight: NumberRange;
}

export interface MentalMathProblem {
  left: number;
  operator: MentalMathOperator;
  right: number;
  answer: number;
}

function randomInteger(min: number, max: number, random: () => number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

export const DEFAULT_MENTAL_MATH_OPTIONS: MentalMathOptions = {
  operations: ["addition", "subtraction", "multiplication", "division"],
  additionLeft: { min: 2, max: 100 },
  additionRight: { min: 2, max: 100 },
  multiplicationLeft: { min: 2, max: 12 },
  multiplicationRight: { min: 2, max: 100 }
};

export function createProblem(
  random: () => number = Math.random,
  options: MentalMathOptions = DEFAULT_MENTAL_MATH_OPTIONS
): MentalMathProblem {
  if (options.operations.length === 0) {
    throw new Error("At least one operation must be enabled.");
  }

  const operation = options.operations[randomInteger(0, options.operations.length - 1, random)];

  if (operation === "addition") {
    const left = randomInteger(options.additionLeft.min, options.additionLeft.max, random);
    const right = randomInteger(options.additionRight.min, options.additionRight.max, random);
    return { left, operator: "+", right, answer: left + right };
  }

  if (operation === "subtraction") {
    const subtrahend = randomInteger(options.additionLeft.min, options.additionLeft.max, random);
    const answer = randomInteger(options.additionRight.min, options.additionRight.max, random);
    return {
      left: subtrahend + answer,
      operator: "−",
      right: subtrahend,
      answer
    };
  }

  if (operation === "multiplication") {
    const left = randomInteger(
      options.multiplicationLeft.min,
      options.multiplicationLeft.max,
      random
    );
    const right = randomInteger(
      options.multiplicationRight.min,
      options.multiplicationRight.max,
      random
    );
    return { left, operator: "×", right, answer: left * right };
  }

  const divisor = randomInteger(
    options.multiplicationLeft.min,
    options.multiplicationLeft.max,
    random
  );
  const answer = randomInteger(
    options.multiplicationRight.min,
    options.multiplicationRight.max,
    random
  );
  return {
    left: divisor * answer,
    operator: "÷",
    right: divisor,
    answer
  };
}

export function isCorrectAnswer(problem: MentalMathProblem, value: string) {
  const normalizedValue = value.trim();
  return /^-?\d+$/.test(normalizedValue) && Number(normalizedValue) === problem.answer;
}
