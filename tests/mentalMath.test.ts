import assert from "node:assert/strict";
import test from "node:test";
import { createProblem, isCorrectAnswer } from "../src/lib/mentalMath.ts";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("generated problems always have valid integer answers", () => {
  const random = seededRandom(42);

  for (let index = 0; index < 5000; index += 1) {
    const problem = createProblem(random);

    if (problem.operator === "+") {
      assert.equal(problem.answer, problem.left + problem.right);
      assert.ok(problem.left >= 2 && problem.left <= 100);
      assert.ok(problem.right >= 2 && problem.right <= 100);
    } else if (problem.operator === "−") {
      assert.equal(problem.answer, problem.left - problem.right);
      assert.ok(problem.answer >= 2 && problem.answer <= 100);
      assert.ok(problem.right >= 2 && problem.right <= 100);
    } else if (problem.operator === "×") {
      assert.equal(problem.answer, problem.left * problem.right);
      assert.ok(problem.left >= 2 && problem.left <= 12);
      assert.ok(problem.right >= 2 && problem.right <= 100);
    } else {
      assert.equal(problem.answer, problem.left / problem.right);
      assert.ok(Number.isInteger(problem.answer));
      assert.ok(problem.right >= 2 && problem.right <= 12);
      assert.ok(problem.answer >= 2 && problem.answer <= 100);
    }
  }
});

test("answer checking accepts integer formatting and rejects other values", () => {
  const problem = { left: 12, operator: "×" as const, right: 4, answer: 48 };

  assert.equal(isCorrectAnswer(problem, "48"), true);
  assert.equal(isCorrectAnswer(problem, " 048 "), true);
  assert.equal(isCorrectAnswer(problem, "47"), false);
  assert.equal(isCorrectAnswer(problem, "48.0"), false);
  assert.equal(isCorrectAnswer(problem, ""), false);
});

test("custom operation and range settings are respected", () => {
  const random = seededRandom(7);
  const options = {
    operations: ["multiplication" as const],
    additionLeft: { min: 20, max: 30 },
    additionRight: { min: 40, max: 50 },
    multiplicationLeft: { min: 6, max: 8 },
    multiplicationRight: { min: 11, max: 13 }
  };

  for (let index = 0; index < 100; index += 1) {
    const problem = createProblem(random, options);
    assert.equal(problem.operator, "×");
    assert.ok(problem.left >= 6 && problem.left <= 8);
    assert.ok(problem.right >= 11 && problem.right <= 13);
  }
});

test("problem generation rejects an empty operation selection", () => {
  assert.throws(
    () =>
      createProblem(Math.random, {
        operations: [],
        additionLeft: { min: 2, max: 100 },
        additionRight: { min: 2, max: 100 },
        multiplicationLeft: { min: 2, max: 12 },
        multiplicationRight: { min: 2, max: 100 }
      }),
    /At least one operation/
  );
});
