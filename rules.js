// ------------------------------------------------------------
// rules.js — the secret rules and the prompts for the game.
//
// Each rule has:
//   text:  what the Rule Keeper sees (and everyone sees at the end)
//   check: a function that returns true if an answer follows the rule
//
// Want to add your own rule? Copy one of these and change it!
// ------------------------------------------------------------

// Helper: turn "Ice Cream!" into "icecream" (lowercase letters only)
function lettersOnly(answer) {
  return answer.toLowerCase().replace(/[^a-z]/g, "");
}

const RULES = [
  {
    text: "The answer starts with a vowel (A, E, I, O, U)",
    check: (a) => /^[aeiou]/.test(lettersOnly(a)),
  },
  {
    text: "The answer ends with a vowel (A, E, I, O, U)",
    check: (a) => /[aeiou]$/.test(lettersOnly(a)),
  },
  {
    text: "The answer has exactly 5 letters",
    check: (a) => lettersOnly(a).length === 5,
  },
  {
    text: "The answer does NOT contain the letter E",
    check: (a) => !lettersOnly(a).includes("e"),
  },
  {
    text: "The answer contains the letter R",
    check: (a) => lettersOnly(a).includes("r"),
  },
  {
    text: "The answer has a double letter (like the 'pp' in apple)",
    check: (a) => /([a-z])\1/.test(lettersOnly(a)),
  },
  {
    text: "The answer starts with a letter from A to M",
    check: (a) => /^[a-m]/.test(lettersOnly(a)),
  },
  {
    text: "The answer has more than 6 letters",
    check: (a) => lettersOnly(a).length > 6,
  },
  {
    text: "The answer is two or more words",
    check: (a) => a.trim().split(/\s+/).length >= 2,
  },
  {
    text: "The answer has an even number of letters",
    check: (a) => {
      const len = lettersOnly(a).length;
      return len > 0 && len % 2 === 0;
    },
  },
  {
    text: "The answer has 4 letters or fewer",
    check: (a) => {
      const len = lettersOnly(a).length;
      return len > 0 && len <= 4;
    },
  },
  {
    text: "The answer does NOT contain the letter A",
    check: (a) => {
      const letters = lettersOnly(a);
      return letters.length > 0 && !letters.includes("a");
    },
  },
];

const PROMPTS = [
  "Name an animal",
  "Name a food",
  "Name a country",
  "Name a job",
  "Name something in a kitchen",
  "Name a sport",
  "Name a color",
  "Name a famous city",
  "Name something you wear",
  "Name a fruit or vegetable",
  "Name something at the beach",
  "Name a musical instrument",
  "Name a type of vehicle",
  "Name something in a classroom",
  "Name a body part",
  "Name a drink",
  "Name something in space",
  "Name a board game or video game",
  "Name a dessert",
  "Name something you find in a park",
];

// Pick a random item from a list
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = { RULES, PROMPTS, pickRandom };
