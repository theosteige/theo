document.querySelectorAll("[data-quiz]").forEach((quiz) => {
  const feedback = quiz.querySelector(".feedback");
  quiz.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const correct = button.hasAttribute("data-correct");
      quiz.querySelectorAll("button").forEach((choice) => {
        choice.disabled = true;
        choice.setAttribute("aria-pressed", String(choice === button));
      });
      feedback.dataset.result = correct ? "correct" : "incorrect";
      feedback.textContent = correct
        ? `Correct. ${quiz.dataset.correct}`
        : `Not quite. ${quiz.dataset.incorrect}`;
    });
  });
});
