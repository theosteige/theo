export const DURATIONS = [15, 30, 60, 120];
export const WORD_COUNTS = [10, 25, 50, 100];
export const DEFAULT_SETTINGS = Object.freeze({
  mode: "time",
  duration: 30,
  wordCount: 25,
  punctuation: false,
  numbers: false,
  source: "english",
  customText: "",
  order: "random",
  freedom: false,
  stopOnError: "off",
  smoothCaret: true,
  smoothScroll: true,
});

const WORDS =
  `the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because these give day most us is was are been has had were may should very much where why here more many long little own old right big high different small large next early young important few public able world hand life child eye woman place week case point government company number group problem fact home water room mother area money story month lot study book job word business issue side kind head house service friend father power hour game line end member law car city community name team minute idea body information lead social understand watch together follow stop face anything create read allow add spend grow open walk win offer remember love consider appear buy wait serve send expect build stay fall reach remain suggest raise pass sell require report decide pull return explain hope develop carry break receive agree support hit produce eat cover catch draw choose light sound under never last found learn change off every great help through before move same tell away again turn around set three air play near still between below country school along plant keep tree cross might close something seem hard start morning always both letter until river enough question night picture being run sometimes nothing without children begin got example paper often music those mark voice care feet leave above family road answer ever stand door sun food best across today sea against top whole black short white person better sure low step front feel true red already yet rest north south happy plan strong clear list blue type test word space`.split(
    /\s+/,
  );

const ENGLISH = [...new Set(WORDS)];
export const characters = (value) => Array.from(value.normalize("NFC"));
export function customWords(text) {
  if (typeof text !== "string" || text.length > 12000)
    throw new Error("Use up to 12,000 characters.");
  const words = text.normalize("NFC").trim().split(/\s+/u).filter(Boolean);
  if (!words.length) throw new Error("Add at least one word.");
  if (words.some((word) => characters(word).length > 40))
    throw new Error("Keep each word to 40 characters or fewer.");
  if (words.some((word) => /[\p{Cc}\p{Cf}]/u.test(word)))
    throw new Error("Remove invisible control characters from your words.");
  return words;
}

export function normalizeSettings(value = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  if (["time", "words"].includes(value.mode)) settings.mode = value.mode;
  if (DURATIONS.includes(value.duration)) settings.duration = value.duration;
  if (
    Number.isInteger(value.wordCount) &&
    value.wordCount >= 1 &&
    value.wordCount <= 500
  )
    settings.wordCount = value.wordCount;
  if (["english", "custom"].includes(value.source))
    settings.source = value.source;
  if (["random", "shuffle", "ordered"].includes(value.order))
    settings.order = value.order;
  if (["off", "word", "letter"].includes(value.stopOnError))
    settings.stopOnError = value.stopOnError;
  for (const key of [
    "punctuation",
    "numbers",
    "freedom",
    "smoothCaret",
    "smoothScroll",
  ]) {
    if (typeof value[key] === "boolean") settings[key] = value[key];
  }
  if (typeof value.customText === "string")
    settings.customText = value.customText.slice(0, 12000);
  return settings;
}

export function generateWords(
  value,
  count = 80,
  random = Math.random,
  preceding = [],
) {
  const settings = normalizeSettings(value);
  const pool =
    settings.source === "custom" ? customWords(settings.customText) : ENGLISH;
  const words = [...preceding];
  let shuffled = [];
  if (
    settings.source === "custom" &&
    settings.order === "shuffle" &&
    preceding.length % pool.length
  ) {
    shuffled = [...pool];
    for (const word of preceding.slice(-(preceding.length % pool.length))) {
      const index = shuffled.indexOf(word);
      if (index >= 0) shuffled.splice(index, 1);
    }
  }
  for (let index = 0; index < count; index++) {
    const absolute = preceding.length + index;
    let word;
    if (settings.source === "custom" && settings.order === "ordered")
      word = pool[absolute % pool.length];
    else if (settings.source === "custom" && settings.order === "shuffle") {
      if (!shuffled.length) {
        shuffled = [...pool];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
      }
      word = shuffled.pop();
    } else {
      const recent = words
        .slice(-2)
        .map((word) => word.toLowerCase().replace(/[.,!?]/g, ""));
      const eligible = pool.filter(
        (word) => !recent.includes(word.toLowerCase()),
      );
      const candidates =
        settings.source === "custom" && pool.length < 4
          ? pool
          : eligible.length
            ? eligible
            : pool;
      word = candidates[Math.floor(random() * candidates.length)];
    }
    // Custom text is used exactly as entered; its own punctuation/case is preserved.
    if (settings.source === "english") {
      if (settings.numbers && random() < 0.15)
        word = String(Math.floor(random() * 1000));
      if (settings.punctuation) {
        if (absolute === 0 || /[.!?]$/.test(words.at(-1) ?? ""))
          word = word[0].toUpperCase() + word.slice(1);
        const chance = random();
        if (chance < 0.1) word += [".", "?", "!"][Math.floor(random() * 3)];
        else if (chance < 0.2) word += ",";
      }
    }
    words.push(word);
  }
  return words.slice(preceding.length);
}

export function createTest(value, suppliedWords) {
  const settings = normalizeSettings(value);
  const words = suppliedWords
    ? [...suppliedWords]
    : generateWords(
        settings,
        settings.mode === "words" ? settings.wordCount : 160,
      );
  if (!words.length) throw new Error("The test needs at least one word.");
  return {
    settings,
    words,
    entries: [""],
    index: 0,
    startedAt: null,
    endedAt: null,
    status: "ready",
    lastWordSubmitted: false,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    mistakes: new Set(),
    samples: [],
  };
}

export function expireTest(test, now) {
  if (
    test.status === "running" &&
    test.settings.mode === "time" &&
    now >= test.startedAt + test.settings.duration * 1000
  ) {
    test.status = "finished";
    test.endedAt = test.startedAt + test.settings.duration * 1000;
  }
  return test.status === "finished";
}

export function typeCharacter(test, character, now) {
  if (
    expireTest(test, now) ||
    characters(character).length !== 1 ||
    /[\p{Cc}\p{Cf}]/u.test(character)
  )
    return;
  const entry = test.entries[test.index];
  const word = test.words[test.index];
  const position = characters(entry).length;
  if (
    (character === " " && !entry) ||
    (position >= characters(word).length + 20 && character !== " ")
  )
    return;
  if (test.startedAt === null) {
    test.startedAt = now;
    test.status = "running";
  }
  const correct =
    character === " "
      ? entry === word
      : character === characters(word)[position];
  test.totalKeystrokes++;
  if (correct) test.correctKeystrokes++;
  else test.mistakes.add(word);
  if (
    !correct &&
    (test.settings.stopOnError === "letter" ||
      (character === " " && test.settings.stopOnError === "word"))
  )
    return;
  if (character === " ") {
    if (
      test.settings.mode === "words" &&
      test.index === test.words.length - 1
    ) {
      test.status = "finished";
      test.endedAt = now;
      test.lastWordSubmitted = true;
      return;
    }
    test.entries[++test.index] = "";
    if (test.settings.mode === "time" && test.words.length - test.index < 40) {
      test.words.push(
        ...generateWords(test.settings, 160, Math.random, test.words),
      );
    }
  } else {
    test.entries[test.index] += character;
    // A word-count test finishes on the last correct letter, without a final space.
    if (
      test.settings.mode === "words" &&
      test.index === test.words.length - 1 &&
      test.entries[test.index] === word
    ) {
      test.status = "finished";
      test.endedAt = now;
    }
  }
}

export function eraseCharacter(
  test,
  now,
  wholeWord = false,
  firstVisibleIndex = 0,
) {
  if (expireTest(test, now)) return;
  if (test.entries[test.index]) {
    test.entries[test.index] = wholeWord
      ? ""
      : characters(test.entries[test.index]).slice(0, -1).join("");
  } else if (
    test.index > firstVisibleIndex &&
    (test.settings.freedom ||
      test.entries[test.index - 1] !== test.words[test.index - 1])
  ) {
    test.entries.pop();
    test.index--;
    if (wholeWord) test.entries[test.index] = "";
  }
}

export function resultForTest(test, now) {
  const elapsedMs =
    test.startedAt === null
      ? 0
      : Math.max(
          test.status === "finished" ? 1 : 0,
          (test.endedAt ?? now) - test.startedAt,
        );
  const seconds = elapsedMs / 1000;
  let correctCharacters = 0,
    rawCharacters = 0,
    incorrectCharacters = 0,
    extraCharacters = 0,
    missedCharacters = 0;
  test.entries.forEach((entry, index) => {
    const target = characters(test.words[index]);
    const typed = characters(entry);
    const submitted =
      index < test.index || (index === test.index && test.lastWordSubmitted);
    rawCharacters += typed.length + Number(submitted);
    for (let i = 0; i < typed.length; i++) {
      if (i >= target.length) extraCharacters++;
      else if (typed[i] !== target[i]) incorrectCharacters++;
    }
    if (
      submitted ||
      (test.settings.mode === "words" && test.status === "finished")
    )
      missedCharacters += Math.max(0, target.length - typed.length);
    if (submitted) {
      if (entry === test.words[index]) correctCharacters += target.length + 1;
    } else if (test.words[index].startsWith(entry))
      correctCharacters += typed.length;
  });
  const divisor =
    test.status === "finished"
      ? Math.max(0.001, seconds)
      : Math.max(1, seconds);
  return {
    correctCharacters,
    rawCharacters,
    incorrectCharacters,
    extraCharacters,
    missedCharacters,
    elapsedMs: Math.round(elapsedMs),
    totalKeystrokes: test.totalKeystrokes,
    correctKeystrokes: test.correctKeystrokes,
    wpm: Math.round((correctCharacters * 12) / divisor),
    rawWpm: Math.round((rawCharacters * 12) / divisor),
    accuracy: test.totalKeystrokes
      ? Math.round((test.correctKeystrokes / test.totalKeystrokes) * 1000) / 10
      : 100,
  };
}
