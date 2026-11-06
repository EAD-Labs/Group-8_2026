// Hands-free answers and commands, full lessons as classroom turns, and handwriting read in two halves.
import { parseChoice, parseCommand, parseDoubtReply, speakOptions } from "../src/lib/hands-free";
import { deepTurns, splitLesson, spokenText } from "../src/lib/deep-lessons";
import { mergeOverlap } from "../src/lib/materials";
import { mergeLive } from "../src/lib/live-turns";
import { buildPilotModules } from "../src/lib/pilot";
let f = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
// ---- spoken answers to a multiple-choice question
const opts = ["combining", "equals", "processes", "population"];
ok([parseChoice("B", opts), parseChoice("option c", opts), parseChoice("I think it's a", opts), parseChoice("the second one", opts), parseChoice("processes", opts), parseChoice("I would say processes", opts)].join() === "1,2,0,1,2,2", "letters, 'option c', 'the second one' and the option's own words are all understood");
ok(parseChoice("hmm not sure", opts) === -1 && parseChoice("", opts) === -1, "an unclear answer is not guessed");
ok(parseChoice("true", ["True", "False"], false) === 0 && parseChoice("that's false", ["True", "False"], false) === 1 && parseChoice("no", ["True", "False"], false) === 1, "true / false by voice");
ok(parseChoice("a little", ["Nothing yet", "A little", "Fairly well", "I could explain it"], false) === 1 && parseChoice("I could explain it", ["Nothing yet", "A little", "Fairly well", "I could explain it"], false) === 3, "check-in chips by their words");
// ---- commands and doubts
const k = (s: string) => parseCommand(s)?.kind ?? "none";
ok([k("pause"), k("wait a second"), k("continue"), k("next"), k("go back"), k("repeat that"), k("say that again"), k("slow down"), k("faster please"), k("stop hands free")].join() === "pause,pause,resume,next,back,repeat,repeat,slower,faster,stop-hands-free", "pause / continue / next / back / repeat / slower / faster / stop are understood");
const d = parseCommand("I have a doubt, why does entropy increase in an isolated system?");
ok(d?.kind === "doubt" && /why does entropy increase/.test((d as { question: string }).question), "“I have a doubt, …” becomes a doubt with the question");
ok(parseCommand("why is the efficiency less than one")?.kind === "doubt", "a plain question asked while the teacher pauses is treated as a doubt");
ok(parseCommand("okay")?.kind === undefined && parseCommand("uh huh") === null, "stray words are ignored (the class just carries on)");
ok(parseCommand("pause the class and explain the whole thing about heat engines in detail")?.kind !== "pause", "a long sentence is not mistaken for a short command");
ok(parseDoubtReply("yes got it") === "got" && parseDoubtReply("not clear") === "again" && parseDoubtReply("can you give an example") === "example", "after a doubt: got it / not clear / example");
ok(speakOptions(["x", "y"]) === "A: x. B: y", "options are read out with their letters");
// ---- a chat-style lesson becomes classroom turns
const md = `## The big idea\n\nEntropy measures how **spread out** energy is. Spontaneous processes increase it.\n\n## Why it happens\n\nThere are far more ways to be spread out than concentrated. This is a statistical statement, not a force pushing things. It is overwhelmingly likely, so we never see coffee reheat itself. Over many molecules, the odds become astronomical.\n\n$$\\Delta S_{univ} \\ge 0$$\n\n- First point here\n- Second point here\n\n## A worked example\n\nTake 600 K and 300 K: efficiency is 1 − 300/600 = 50%.`;
const secs = splitLesson(md, 180);
ok(secs.length === 3 && secs.map((s) => s.title).join("|") === "The big idea|Why it happens|A worked example", "the lesson's own headings become the class's sections");
ok(secs[1]!.turns.length >= 3 && secs[1]!.turns.every((t) => t.text.length <= 260), "long paragraphs become several short spoken turns (whole sentences)");
ok(secs[1]!.turns.some((t) => /S_\{univ\}|\\ge/.test(t.board)), "an equation goes on the board");
ok(!secs.some((s) => s.turns.some((t) => /\*\*|##|\$\$/.test(t.text))), "markdown symbols are not read aloud");
ok(spokenText("**bold** and `code` and [link](http://x)") === "bold and code and link", "spoken text keeps the words, drops the formatting");
const st = buildPilotModules().find((m) => m.slug === "thermodynamics")!.concepts[1]!.stages;
const dt = deepTurns(st, secs, "t:x");
const merged = mergeLive(st, dt);
ok(merged.length === st.length + dt.length, `the full lesson adds ${dt.length} teaching turns to the ${st.length}-turn class`);
const firstDeep = merged.findIndex((s) => s.id?.includes("#deep0"));
ok(firstDeep > 0 && merged[firstDeep - 1]!.kind === "explain", "it is woven in right after the class's own teaching turns");
ok(merged.findIndex((s) => s.id?.includes("#deep")) < merged.findIndex((s) => s.kind === "checkpoint") && merged.filter((s, i) => s.id?.includes("#deep") && i > merged.findIndex((x) => x.kind === "checkpoint")).length === 0, "all of it comes before the checkpoint (the checkpoint tests what was taught)");
const late = st.findIndex((s) => s.kind === "mcq");
const dtLate = deepTurns(st, secs, "t:x", st[late]!.id);
const mergedLate = mergeLive(st, dtLate);
ok(mergedLate.findIndex((s) => s.id?.includes("#deep")) > late, "a lesson that arrives mid-class is placed from where the learner is, never behind them");
// ---- handwriting read in two overlapping halves
const top = ["Entropy notes", "S = k ln W", "Second law: dS >= 0", "for isolated systems"];
const bottom = ["Second law: dS ≥ 0", "for isolated systems", "Example: ice melting", "ΔS = Q/T"];
ok(mergeOverlap(top, bottom).join(" | ") === "Entropy notes | S = k ln W | Second law: dS >= 0 | for isolated systems | Example: ice melting | ΔS = Q/T", "the lines both halves saw appear once");
ok(mergeOverlap(["a b c"], ["x y z"]).length === 2, "halves with no overlap are simply joined");
console.log(f ? `${f} FAILED` : "ALL PASSED"); process.exit(f ? 1 : 0);
