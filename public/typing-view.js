import { characters } from "/typing-logic.js?v=20260928-v2";

// Letter nodes survive keystrokes. Only new words and extra letters allocate DOM.
export function createTypingView(viewport, track, words, caret) {
  let previousIndex = 0;
  let scrollTop = 0;
  let currentTest;
  let previousRow = 0;

  function makeLetter(text) {
    const span = document.createElement("span");
    span.className = "typing-letter";
    span.textContent = text;
    return span;
  }

  function updateWord(test, index) {
    const element = words.children[index];
    const target = characters(test.words[index]);
    const input = characters(test.entries[index] ?? "");
    element.id = index === test.index ? "active-word" : "";
    element.classList.toggle(
      "missed",
      index < test.index && test.entries[index] !== test.words[index],
    );
    const length = Math.max(target.length, input.length);
    while (element.children.length > length) element.lastElementChild.remove();
    while (element.children.length < length)
      element.append(makeLetter(input[element.children.length]));
    for (let position = 0; position < length; position++) {
      const letter = element.children[position];
      const content = target[position] ?? input[position];
      if (letter.textContent !== content) letter.textContent = content;
      letter.classList.toggle(
        "correct",
        position < input.length && input[position] === target[position],
      );
      letter.classList.toggle(
        "incorrect",
        position < input.length && input[position] !== target[position],
      );
      letter.classList.toggle("extra", position >= target.length);
    }
  }

  function render(test, { reset = false, instant = false } = {}) {
    currentTest = test;
    const lineHeight = Math.ceil(
      parseFloat(getComputedStyle(viewport).fontSize) * 1.8,
    );
    viewport.style.setProperty("--typing-line-height", `${lineHeight}px`);
    if (reset) {
      words.replaceChildren();
      previousIndex = 0;
      scrollTop = 0;
    }
    const end = Math.min(test.words.length, test.index + 80);
    const fragment = document.createDocumentFragment();
    for (let index = words.children.length; index < end; index++) {
      const word = document.createElement("span");
      word.className = "typing-word";
      word.append(...characters(test.words[index]).map(makeLetter));
      fragment.append(word);
    }
    words.append(fragment);
    for (
      let index = Math.min(previousIndex, test.index);
      index <= Math.max(previousIndex, test.index);
      index++
    )
      updateWord(test, index);
    const active = words.children[test.index];
    const position = characters(test.entries[test.index]).length;
    const letter = active.children[position] ?? active.lastElementChild;
    const row = active.offsetTop + letter.offsetTop;
    // Whole pixel rows. A keystroke within a row never changes text position.
    if (reset || instant || previousRow !== row)
      scrollTop = Math.max(0, row - lineHeight);
    track.style.marginTop = `${-scrollTop}px`;
    const bounds = letter.getBoundingClientRect();
    const origin = words.getBoundingClientRect();
    caret.classList.toggle("instant", reset || instant);
    caret.style.left = `${(position < active.children.length ? bounds.left : bounds.right) - origin.left}px`;
    caret.style.top = `${row - scrollTop + (lineHeight - caret.offsetHeight) / 2}px`;
    previousIndex = test.index;
    previousRow = row;
  }

  function canAppend(character) {
    if (!currentTest || /\s/u.test(character)) return true;
    const active = words.children[currentTest.index];
    const length = characters(currentTest.entries[currentTest.index]).length;
    if (length < characters(currentTest.words[currentTest.index]).length)
      return true;
    // Match Monkeytype's boundary guard: don't accept an extra letter that
    // would move the active word or wrap it. Remove the probe before paint.
    const top = active.offsetTop;
    const height = active.offsetHeight;
    const probe = makeLetter(character);
    active.append(probe);
    const fits =
      active.offsetTop === top &&
      active.offsetHeight === height &&
      active.offsetWidth <= viewport.clientWidth;
    probe.remove();
    return fits;
  }

  return {
    render,
    canAppend,
    firstVisibleIndex() {
      return Array.from(words.children).findIndex(
        (word) => word.offsetTop >= scrollTop,
      );
    },
  };
}
