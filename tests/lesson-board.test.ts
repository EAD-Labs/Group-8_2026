// The lecture board: markdown blocks, safe graph formulas, and turns that know which block they read.
import { compile, parsePlot, samplePlot, toBlocks } from "../src/lib/lesson-md";
import { speakTex, splitLesson } from "../src/lib/deep-lessons";
let f = 0; const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) f++; };
ok(compile("1 - 300/x")!(600) === 0.5 && compile("2x^2 + 3")!(2) === 11 && Math.abs(compile("sin(pi/2)")!(0) - 1) < 1e-12 && compile("exp(-x)")!(0) === 1, "graph formulas: arithmetic, powers, implicit multiplication, functions and constants");
ok([compile("import(1)"), compile("x+"), compile("alert(1)"), compile("constructor")].every((x) => x === null), "anything that is not a formula is refused (no code is ever run)");
const md = "## Part one\n\nText with $T_h$ inline.\n\n$$\\eta = 1 - \\frac{T_c}{T_h}$$\n\n- a\n- b\n\n```plot\n{\"title\":\"t\",\"x\":{\"min\":300,\"max\":1500},\"series\":[{\"expr\":\"1 - 300/x\"}]}\n```\n\n```plot\n{\"x\":{\"min\":5,\"max\":1},\"series\":[]}\n```\n";
ok(toBlocks(md).map((b) => b.kind).join() === "heading,p,math,list,plot", "markdown becomes board blocks; an invalid graph is dropped, not drawn wrong");
ok(parsePlot('{"x":{"min":0,"max":1},"series":[{"expr":"x^2"}]}') !== null && parsePlot("{bad") === null && parsePlot('{"x":{"min":0,"max":1},"series":[{"expr":"eval(1)"}]}') === null, "graph specs are validated");
const pts = samplePlot(parsePlot('{"x":{"min":-1,"max":1},"series":[{"expr":"1/x"}]}')!, 4)[0]!.pts;
ok(pts.some((p) => p === null), "a graph breaks its line where the formula has no value (1/x at 0)");
ok(speakTex("\\eta = 1 - \\frac{T_c}{T_h}") === "eta equals 1 - T c over T h" && speakTex("x^2") === "x squared", "formulas are read aloud in words: " + speakTex("\\eta = 1 - \\frac{T_c}{T_h}"));
const secs = splitLesson(md);
ok(secs.length === 1 && secs[0]!.blocks.length === 4, "a section keeps its board blocks");
ok(secs[0]!.turns.map((t) => `${t.kind}@${t.block}`).join() === "p@0,math@1,list@2,plot@3", "each spoken turn knows which block of the board it is reading");
ok(!/\$|\\\\/.test(secs[0]!.turns[0]!.text) && /T h/.test(secs[0]!.turns[0]!.text), "inline maths is spoken naturally, not as code: " + secs[0]!.turns[0]!.text);
console.log(f ? `${f} FAILED` : "ALL PASSED"); process.exit(f ? 1 : 0);
