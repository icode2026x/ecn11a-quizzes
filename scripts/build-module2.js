const fs = require("fs");

function extractArray(src, varName) {
  const code = `
    function _m2(list) {
      return list.map((item, index) => ({
        id: "m2q" + (index + 1),
        question: item[0],
        options: item[1],
        correct: item[2],
        explanation: item[3]
      }));
    }
    ${src}
    return ${varName};
  `;
  return new Function(code)();
}

const q1 = extractArray(fs.readFileSync("js/module2-part1.js", "utf8"), "AMERICAN_REVOLUTION_QUESTIONS");
const q2 = extractArray(fs.readFileSync("js/module2-part2.js", "utf8"), "AMERICAN_REVOLUTION_QUESTIONS_P2");
const q3 = extractArray(fs.readFileSync("js/module2-part3.js", "utf8"), "AMERICAN_REVOLUTION_QUESTIONS_P3");

const all = [...q1, ...q2, ...q3].map((q, i) => ({ ...q, id: "m2q" + (i + 1) }));
console.log("counts", q1.length, q2.length, q3.length, "total", all.length);

const key = `
1B 2C 3B 4B 5C 6A 7B 8A 9B 10C 11B 12A 13A 14A 15B 16A 17C 18A 19A 20B
21B 22B 23B 24B 25C 26C 27A 28B 29B 30B 31A 32B 33B 34B 35B 36A 37B 38B 39B 40A
41B 42B 43A 44A 45A 46A 47A 48A 49A 50A 51A 52C 53B 54A 55A 56A 57A 58A 59A 60A
61B 62A 63A 64A 65A 66A 67A 68A 69A 70A 71A 72B 73B 74A 75B 76A 77D 78A 79A 80A
81A 82A 83B 84B 85A 86A 87A 88A 89B 90A 91A 92A 93A 94A 95A 96A 97A 98A 99A 100A
101A 102B 103A 104A 105B 106C 107A 108A 109A 110A 111A 112A 113B 114B 115A 116A 117A 118A 119A 120A
121A 122A 123A 124A 125A 126A 127A 128A 129A 130A 131A 132A 133A 134A 135A 136A 137A 138A
139A 140C 141C 142B 143B 144B 145B 146C 147A 148A 149A 150A 151A 152A 153A 154B 155A
156A 157B 158A 159A 160A 161A 162A 163A 164A 165A 166A 167A 168B
169A 170A 171A 172A 173A 174A 175A 176A 177A 178A 179A 180A 181A 182A 183A 184A 185A 186A 187A 188A
189A 190A 191A 192A 193A 194A 195A 196A 197A 198A 199A 200A 201A 202A 203A 204A 205A 206A 207A 208A 209A 210A
`.trim().split(/\s+/).map((t) => {
  const m = t.match(/^(\d+)([A-D])$/);
  return [parseInt(m[1], 10), { A: 0, B: 1, C: 2, D: 3 }[m[2]]];
});

console.log("key pairs", key.length);
const mismatches = [];
key.forEach(([n, expected]) => {
  const q = all[n - 1];
  if (!q) mismatches.push("missing " + n);
  else if (q.correct !== expected) mismatches.push(`Q${n}: got ${q.correct} expected ${expected} (${q.options[q.correct]})`);
});
console.log(mismatches.length ? mismatches.join("\n") : "ALL ANSWERS MATCH");

let bad = 0;
all.forEach((q, i) => {
  if (!q.question || q.options.length !== 4 || q.options.some((o) => !o) || q.correct < 0 || q.correct > 3 || !q.explanation) {
    bad++;
    console.log("struct", i + 1);
  }
});
console.log("struct issues", bad);

const out =
  "/* Module 2 — American Revolution: Points of Contention (210 questions) */\n" +
  "const AMERICAN_REVOLUTION_QUESTIONS = " +
  JSON.stringify(all, null, 2) +
  ";\n";
fs.writeFileSync("js/module2-data.js", out);
console.log("wrote js/module2-data.js");
