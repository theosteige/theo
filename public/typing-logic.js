export const DURATIONS = [15, 30, 60, 120];

const WORDS =
  `the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because these give day most us is was are been has had were may should very much where why here more many long little own old right big high different small large next early young important few public able world hand life child eye woman place week case point government company number group problem fact home water room mother area money story month lot study book job word business issue side kind head house service friend father power hour game line end member law car city community name team minute idea body information lead social understand watch together follow stop face anything create read allow add spend grow open walk win offer remember love consider appear buy wait serve send expect build stay fall reach remain suggest raise pass sell require report decide pull return explain hope develop carry break receive agree support hit produce eat cover catch draw choose light sound under never last found learn change off every great help through before move same tell away again turn around set three air play near still between below country school along plant keep tree cross might close something seem hard start morning always both letter until river enough question night picture being run sometimes nothing without children begin got example paper often music those mark voice care feet leave above family road answer ever stand door sun food best across today sea against top whole black short white person better sure low step front feel true red already yet rest north south happy plan strong clear list blue type test word space`.split(
    /\s+/,
  );

export function generateWords(settings, count = 80, random = Math.random) {
  const words = [];
  for (let index = 0; index < count; index++) {
    let word = WORDS[Math.floor(random() * WORDS.length)];
    if (settings.numbers && index % 7 === 4)
      word = String(Math.floor(random() * 1000));
    if (settings.punctuation) {
      if (index % 8 === 0) word = word[0].toUpperCase() + word.slice(1);
      if (index % 8 === 7) word += [".", "?", "!"][Math.floor(random() * 3)];
      else if (index % 8 === 3) word += ",";
    }
    words.push(word);
  }
  return words;
}

export function createTest(settings, words = generateWords(settings)) {
  return {
    settings: { ...settings },
    words,
    entries: [""],
    index: 0,
    startedAt: null,
    status: "ready",
    totalKeystrokes: 0,
    correctKeystrokes: 0,
  };
}

export function expireTest(test, now) {
  if (
    test.status === "running" &&
    now >= test.startedAt + test.settings.duration * 1000
  ) {
    test.status = "finished";
  }
  return test.status === "finished";
}

export function typeCharacter(test, character, now) {
  if (
    expireTest(test, now) ||
    character.length !== 1 ||
    !/^[\x20-\x7E]$/.test(character)
  )
    return;
  const entry = test.entries[test.index];
  if (
    (character === " " && !entry) ||
    (entry.length >= 40 && character !== " ")
  )
    return;
  if (test.startedAt === null) {
    test.startedAt = now;
    test.status = "running";
  }
  test.totalKeystrokes++;
  const word = test.words[test.index];
  if (character === " ") {
    if (entry === word) test.correctKeystrokes++;
    test.index++;
    test.entries[test.index] = "";
    if (test.words.length - test.index < 40)
      test.words.push(...generateWords(test.settings));
  } else {
    if (character === word[entry.length]) test.correctKeystrokes++;
    test.entries[test.index] += character;
  }
}

export function eraseCharacter(test, now) {
  if (expireTest(test, now)) return;
  if (test.entries[test.index])
    test.entries[test.index] = test.entries[test.index].slice(0, -1);
  else if (test.index > 0) {
    test.entries.pop();
    test.index--;
  }
}

export function resultForTest(test, now) {
  const seconds =
    test.startedAt === null
      ? 0
      : Math.min(test.settings.duration, (now - test.startedAt) / 1000);
  let correctCharacters = 0;
  test.entries.forEach((entry, index) => {
    // Only fully correct submitted words earn WPM; a correct final partial word counts too.
    const word = test.words[index];
    if (index < test.index) {
      if (entry === word) correctCharacters += word.length + 1;
    } else if (word.startsWith(entry)) correctCharacters += entry.length;
  });
  return {
    ...test.settings,
    correctCharacters,
    totalKeystrokes: test.totalKeystrokes,
    correctKeystrokes: test.correctKeystrokes,
    wpm:
      seconds > 0
        ? Math.round((correctCharacters * 12) / Math.max(1, seconds))
        : 0,
    rawWpm:
      seconds > 0
        ? Math.round((test.totalKeystrokes * 12) / Math.max(1, seconds))
        : 0,
    accuracy: test.totalKeystrokes
      ? Math.round((test.correctKeystrokes / test.totalKeystrokes) * 1000) / 10
      : 0,
  };
}
