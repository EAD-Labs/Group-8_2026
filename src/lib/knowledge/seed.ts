import type { Bloom, Claim, ClaimRole, Disagreement, Misconception, VerifiedRecord } from "./types";

// Seeded, pre-verified reference records for the two pilot modules (HLD §6.4). They are authored
// content, so provenance says "seeded-reference"; the disagreements recorded are the well-known
// conflicting formulations a verification pass has to settle, not transcripts of live model output.

const SEED_DATE = "2026-08-23T00:00:00.000Z";
const c = (id: string, role: ClaimRole, text: string): Claim => ({ id, role, text });
const m = (id: string, name: string, wrong: string, right: string): Misconception => ({
  id,
  name,
  wrong,
  right,
});
const d = (
  id: string,
  point: string,
  a: [string, string],
  b: [string, string],
  resolution: string,
  reasoning: string,
  claimId: string,
): Disagreement => ({
  id,
  point,
  claimId,
  positions: [
    { agent: a[0], claim: a[1] },
    { agent: b[0], claim: b[1] },
  ],
  resolution,
  reasoning,
});
type Spec = {
  module: string;
  slug: string;
  title: string;
  topic: string;
  bloom: Bloom;
  claims: Claim[];
  mis: Misconception[];
  basic: string[];
  probes: string[];
  blanks: Array<[string, string, string, string[], string, string?]>;
  hints: Array<[string, string, string, string[], string, string?]>;
  example: string;
  equation: string;
  transfer: string;
  prereq?: string[];
  dis: Disagreement[];
};
const rec = (s: Spec): VerifiedRecord => ({
  id: `rec-${s.module}-${s.slug}`,
  key: `${s.module}:${s.slug}`,
  topic: s.topic,
  title: s.title,
  bloom: s.bloom,
  claims: s.claims,
  misconceptions: s.mis,
  basic: s.basic,
  probes: s.probes,
  example: s.example,
  equation: s.equation,
  transfer: s.transfer,
  prereq: s.prereq ?? [],
  blanks: s.blanks.map(([before, answer, after, accept, claimId, misconceptionId], i) => ({
    id: `${s.slug}-b${i + 1}`,
    before,
    answer,
    after,
    accept,
    claimId,
    ...(misconceptionId ? { misconceptionId } : {}),
  })),
  hints: s.hints.map(([question, hint, answer, accept, claimId, misconceptionId], i) => ({
    id: `${s.slug}-h${i + 1}`,
    question,
    hint,
    answer,
    accept,
    claimId,
    ...(misconceptionId ? { misconceptionId } : {}),
  })),
  provenance: {
    providers: ["seeded-reference"],
    disagreements: s.dis,
    confidence: "high",
    verifiedAt: SEED_DATE,
    origin: "seeded",
    note: "Authored reference record; disagreements are the documented conflicting formulations settled for this course.",
  },
});
const TXT_A = "Textbook convention A",
  TXT_B = "Textbook convention B";

const THERMO: Spec[] = [
  {
    module: "thermodynamics",
    slug: "first-law",
    title: "First law & energy accounting",
    topic: "energy accounting",
    bloom: "Apply",
    claims: [
      c(
        "fl-1",
        "define",
        "The first law says energy is conserved: for a closed system the change in internal energy equals the heat added to the system minus the work done by the system, ΔU = Q − W.",
      ),
      c(
        "fl-2",
        "mechanism",
        "Before any accounting you must name the system and its boundary; only energy crossing that boundary counts as heat or work.",
      ),
      c(
        "fl-3",
        "pitfall",
        "Heat and work are energy in transit across the boundary, not stored in the system; only internal energy U is a property the system holds.",
      ),
      c(
        "fl-4",
        "example",
        "A gas in a piston that absorbs 500 J of heat while doing 200 J of work on its surroundings gains 300 J of internal energy.",
      ),
      c(
        "fl-5",
        "boundary",
        "Move the boundary and the bookkeeping changes: a battery-and-motor energy flow is internal when the boundary surrounds both, but heat and work when it surrounds only the motor.",
      ),
    ],
    mis: [
      m(
        "fl-m1",
        "heat stored in a system",
        "A hot gas contains a lot of heat.",
        "It holds internal energy; heat is only the energy transferred across the boundary.",
      ),
      m(
        "fl-m2",
        "boundary left undefined",
        "It does not matter where I draw the boundary.",
        "The boundary fixes what counts as heat and work, so it must be chosen first.",
      ),
    ],
    basic: [
      "Hold on — what exactly counts as the 'system' here?",
      "So is heat something the gas has, like its temperature?",
      "Why do we keep subtracting the work instead of adding it?",
    ],
    probes: [
      "If energy is conserved, why can't I just say the gas 'lost' 200 J of heat when it expanded?",
      "What if I redraw the boundary to include the piston — does ΔU change?",
    ],
    blanks: [
      [
        "For a closed system, the change in internal energy equals the heat added minus the",
        "work",
        "done by the system.",
        ["work"],
        "fl-1",
      ],
      [
        "Heat and work describe energy crossing the",
        "boundary",
        ", not energy stored inside.",
        ["boundary", "system boundary"],
        "fl-3",
        "fl-m1",
      ],
    ],
    hints: [
      [
        "A gas absorbs 500 J of heat and does 200 J of work on its surroundings. What happens to its internal energy?",
        "Use ΔU = Q − W and keep the signs.",
        "It increases by 300 J.",
        ["300", "increase", "gain", "rises"],
        "fl-4",
      ],
      [
        "Does a hot cup of tea 'contain' heat?",
        "Think about what is stored versus what is transferred.",
        "No — it holds internal energy; heat is only the transfer.",
        ["no", "internal energy", "transfer"],
        "fl-3",
        "fl-m1",
      ],
    ],
    example:
      "For a piston, energy crossing as heat can become boundary work or change internal energy; the balance depends on the chosen boundary.",
    equation: "ΔU = Q − W",
    transfer:
      "A battery drives a motor that lifts a mass while warming. Draw the boundary and account for every energy transfer.",
    dis: [
      d(
        "fl-d1",
        "Is heat a property a body contains?",
        ["Agent view 1", "A hotter body contains more heat."],
        ["Agent view 2", "Heat is energy in transit; the body holds internal energy."],
        "Heat is energy in transit; only internal energy is stored.",
        "Heat and work are path-dependent transfers; U is a state function, so 'contains heat' is a category error.",
        "fl-3",
      ),
    ],
  },
  {
    module: "thermodynamics",
    slug: "second-law",
    title: "Second law & entropy",
    topic: "the second law",
    bloom: "Understand",
    claims: [
      c(
        "sl-1",
        "define",
        "The second law says the total entropy of an isolated system never decreases: spontaneous processes increase it or leave it unchanged.",
      ),
      c(
        "sl-2",
        "mechanism",
        "Entropy counts how many ways energy can be spread among a system's accessible states; spreading out is overwhelmingly more probable than un-spreading.",
      ),
      c(
        "sl-3",
        "pitfall",
        "Entropy is not simply 'disorder'; it is a directional constraint on which processes can happen spontaneously.",
      ),
      c(
        "sl-4",
        "example",
        "Hot coffee cools because energy spreads into the room, not because energy disappears; the reverse would conserve energy but is overwhelmingly improbable.",
      ),
      c(
        "sl-5",
        "boundary",
        "One part of the universe can lose entropy if its surroundings gain at least as much, as a refrigerator does.",
      ),
    ],
    mis: [
      m(
        "sl-m1",
        "entropy as mere disorder",
        "Entropy just means messiness.",
        "Entropy measures how energy is spread over accessible states and gives spontaneous change its direction.",
      ),
      m(
        "sl-m2",
        "local decrease read as a violation",
        "If a system's entropy falls, the second law is broken.",
        "Only the total for an isolated system — system plus surroundings — must not decrease.",
      ),
    ],
    basic: [
      "Is entropy just a fancy word for mess?",
      "If energy is conserved, why does coffee never re-heat itself?",
      "Who decides which way a process goes?",
    ],
    probes: [
      "If the first law allows the coffee to re-heat by taking energy from the room, what exactly forbids it?",
      "Can entropy ever decrease anywhere? Then what does 'never decreases' mean?",
    ],
    blanks: [
      [
        "The total entropy of an isolated system can never",
        "decrease",
        ".",
        ["decrease", "go down", "fall"],
        "sl-1",
        "sl-m2",
      ],
      [
        "Entropy measures how energy is",
        "spread",
        "among accessible states.",
        ["spread", "distributed", "dispersed"],
        "sl-2",
        "sl-m1",
      ],
    ],
    hints: [
      [
        "A hot coffee cools to room temperature. Does the entropy of the coffee-plus-room increase or decrease?",
        "Energy is spreading into more places.",
        "It increases.",
        ["increase", "rises", "up", "grow"],
        "sl-4",
      ],
      [
        "Why doesn't a cooled cup of coffee spontaneously re-heat even though energy would be conserved?",
        "Compare how likely it is for energy to spread out versus gather back.",
        "Gathering back is overwhelmingly improbable — it would decrease total entropy.",
        ["improbable", "unlikely", "entropy", "decrease", "probab"],
        "sl-2",
        "sl-m1",
      ],
    ],
    example:
      "Hot coffee cools because energy disperses into the room, not because energy disappears.",
    equation: "ΔS_universe ≥ 0",
    transfer:
      "A refrigerator moves heat from cold to hot. Explain why this does not violate the second law.",
    dis: [
      d(
        "sl-d1",
        "Does the second law forbid any decrease of entropy anywhere?",
        ["Agent view 1", "Entropy can never decrease anywhere."],
        ["Agent view 2", "Local decreases are allowed if compensated elsewhere."],
        "Local decreases are allowed when the surroundings gain at least as much.",
        "The law constrains the total of an isolated system; freezing water and refrigerators show local decreases paid for elsewhere.",
        "sl-5",
      ),
    ],
  },
  {
    module: "thermodynamics",
    slug: "sign-conventions",
    title: "Sign conventions for work and heat",
    topic: "heat and work signs",
    bloom: "Apply",
    prereq: ["thermodynamics:first-law"],
    claims: [
      c(
        "sc-1",
        "define",
        "Signs encode direction relative to the chosen system: with ΔU = Q − W, heat into the system is positive and work done by the system is positive.",
      ),
      c(
        "sc-2",
        "mechanism",
        "A sign convention is a choice, but it must stay consistent through a whole calculation; switching halfway produces wrong answers.",
      ),
      c(
        "sc-3",
        "pitfall",
        "Memorising 'compression work is negative' without stating the convention fails the moment the convention changes.",
      ),
      c(
        "sc-4",
        "example",
        "A gas that expands doing 200 J of work on its surroundings has W = +200 J under ΔU = Q − W; if 200 J of work is done on it, W = −200 J.",
      ),
      c(
        "sc-5",
        "formula",
        "Engineering uses ΔU = Q − W; the physics convention ΔU = Q + W only flips the sign of W, so ΔU itself is unchanged.",
      ),
    ],
    mis: [
      m(
        "sc-m1",
        "sign memorised without the convention",
        "Compression work is always negative, full stop.",
        "Its sign depends on the convention and on who does the work.",
      ),
      m(
        "sc-m2",
        "sign convention reversed",
        "A negative Q means my formula is broken.",
        "A negative Q simply means heat leaves the system.",
      ),
    ],
    basic: [
      "Why is work done by the gas positive here, when I have seen it negative in other books?",
      "What does a negative Q actually mean?",
      "Which direction is 'positive' supposed to be?",
    ],
    probes: [
      "If I switch to ΔU = Q + W halfway through, which numbers change and which don't?",
      "Does the sign of W change the physical energy balance or only the bookkeeping?",
    ],
    blanks: [
      [
        "Under ΔU = Q − W, work done",
        "by",
        "the system is counted as positive.",
        ["by"],
        "sc-1",
        "sc-m1",
      ],
      [
        "A negative Q means heat flows",
        "out of",
        "the system.",
        ["out", "out of", "from"],
        "sc-1",
        "sc-m2",
      ],
    ],
    hints: [
      [
        "A gas is compressed by 150 J of work while losing 40 J of heat. Using ΔU = Q − W, what are Q and W?",
        "Heat leaves; work is done on the gas.",
        "Q = −40 J and W = −150 J, so ΔU = +110 J.",
        ["-40", "−40", "-150", "−150", "110"],
        "sc-4",
        "sc-m2",
      ],
      [
        "Does choosing a different sign convention change ΔU?",
        "Think physics, not bookkeeping.",
        "No — ΔU is physical; only the sign of W in the formula changes.",
        ["no", "same", "bookkeeping", "convention"],
        "sc-5",
      ],
    ],
    example:
      "With ΔU = Q − W, expansion work done by the system is positive W and reduces internal energy.",
    equation: "ΔU = Q − W",
    transfer:
      "A gas is compressed while losing heat. Determine the signs first, then reason about ΔU.",
    dis: [
      d(
        "sc-d1",
        "Is it ΔU = Q + W or ΔU = Q − W?",
        [TXT_A, "ΔU = Q + W (work done on the system is positive)."],
        [TXT_B, "ΔU = Q − W (work done by the system is positive)."],
        "Both are valid under opposite conventions; this course fixes ΔU = Q − W and states it every time.",
        "The physics is identical; only the sign of W differs, so the record commits to one convention to avoid mixing.",
        "sc-5",
      ),
    ],
  },
  {
    module: "thermodynamics",
    slug: "reversibility",
    title: "Reversible vs irreversible processes",
    topic: "reversibility",
    bloom: "Analyse",
    prereq: ["thermodynamics:second-law"],
    claims: [
      c(
        "rv-1",
        "define",
        "A reversible process is an idealised limit in which the system passes through equilibrium states, so an infinitesimal change can reverse it, leaving no net change in system or surroundings.",
      ),
      c(
        "rv-2",
        "mechanism",
        "Real processes with friction, finite temperature differences or free expansion are irreversible and generate entropy: S_gen > 0.",
      ),
      c(
        "rv-3",
        "pitfall",
        "'Reversible' does not mean a real process can simply be played backwards; restoring the surroundings would need other changes.",
      ),
      c(
        "rv-4",
        "example",
        "A gas in free expansion can be recompressed, but only by doing work that warms the surroundings, so the surroundings are not restored.",
      ),
      c(
        "rv-5",
        "formula",
        "S_gen = 0 for a reversible process and S_gen > 0 for an irreversible one; no process has S_gen < 0.",
      ),
    ],
    mis: [
      m(
        "rv-m1",
        "reverse playback mistaken for reversibility",
        "Reversible means I can run the film backwards.",
        "Reversible means everything, including the surroundings, can be restored with no net change, which needs zero entropy generation.",
      ),
      m(
        "rv-m2",
        "slow real process treated as reversible",
        "A slow real process is fully reversible.",
        "Slowness approaches but never reaches reversibility; friction and other dissipation remain.",
      ),
    ],
    basic: [
      "Isn't every process reversible if I just push the piston back?",
      "What is the difference between 'can go backwards' and 'reversible'?",
      "Why study a process that cannot really exist?",
    ],
    probes: [
      "If I expand a gas very slowly, is it reversible? What would still generate entropy?",
      "Where exactly is entropy generated in free expansion when nothing rubs?",
    ],
    blanks: [
      [
        "In a reversible process the entropy generation S_gen equals",
        "zero",
        ".",
        ["zero", "0"],
        "rv-5",
        "rv-m1",
      ],
      [
        "A reversible process is an idealised",
        "limit",
        "of infinitely slow, equilibrium-state changes.",
        ["limit", "limiting case", "ideal"],
        "rv-1",
        "rv-m2",
      ],
    ],
    hints: [
      [
        "A gas expands freely into a vacuum. Reversible or irreversible?",
        "Can the surroundings be restored without any other change?",
        "Irreversible — entropy is generated and the surroundings cannot be restored for free.",
        ["irreversible"],
        "rv-4",
        "rv-m1",
      ],
      [
        "Can S_gen ever be negative?",
        "That would let the entropy of an isolated system decrease.",
        "No — S_gen ≥ 0 always.",
        ["no", "never", "not", "zero"],
        "rv-5",
      ],
    ],
    example:
      "Free expansion can return to its initial volume mechanically, but the surroundings cannot be restored without other changes.",
    equation: "S_gen = 0 reversible; S_gen > 0 irreversible",
    transfer:
      "Compare slow piston expansion with free expansion and locate the entropy generation.",
    dis: [
      d(
        "rv-d1",
        "Is a very slow real expansion reversible?",
        ["Agent view 1", "Yes, if it is slow enough."],
        ["Agent view 2", "No — only the idealised limit is reversible."],
        "Only the idealised limit is reversible; slowness is necessary but not sufficient.",
        "Dissipative effects such as friction remain no matter how slow the real process is.",
        "rv-3",
      ),
    ],
  },
  {
    module: "thermodynamics",
    slug: "entropy-universe",
    title: "Entropy of the universe in a spontaneous process",
    topic: "entropy of the universe",
    bloom: "Analyse",
    prereq: ["thermodynamics:second-law"],
    claims: [
      c("eu-1", "define", "For any spontaneous process ΔS_univ = ΔS_sys + ΔS_surr ≥ 0."),
      c(
        "eu-2",
        "mechanism",
        "A spontaneous process may lower the system's entropy provided the surroundings gain at least as much.",
      ),
      c(
        "eu-3",
        "pitfall",
        "Looking only at the system can wrongly label a spontaneous process impossible.",
      ),
      c(
        "eu-4",
        "example",
        "Water freezing below 0 °C has ΔS_sys < 0, but the heat it releases raises ΔS_surr by more, so ΔS_univ > 0.",
      ),
      c(
        "eu-5",
        "boundary",
        "At the equilibrium (melting) point ΔS_univ = 0: the process is reversible and has no preferred direction.",
      ),
    ],
    mis: [
      m(
        "eu-m1",
        "local entropy decrease read as a violation",
        "Water freezing violates the second law because its entropy falls.",
        "Check ΔS_univ: the surroundings gain more entropy than the water loses.",
      ),
      m(
        "eu-m2",
        "surroundings ignored",
        "Only the system's entropy matters.",
        "The total of system and surroundings decides whether a process is spontaneous.",
      ),
    ],
    basic: [
      "How can water freezing be allowed if it becomes more ordered?",
      "What exactly are 'the surroundings' — the whole room?",
      "Do I always have to add both entropies?",
    ],
    probes: [
      "At exactly 0 °C, is freezing spontaneous? What is ΔS_univ there?",
      "How would you show that a supercooled liquid crystallising is allowed?",
    ],
    blanks: [
      [
        "A spontaneous process must have ΔS_univ greater than or equal to",
        "zero",
        ".",
        ["zero", "0"],
        "eu-1",
        "eu-m2",
      ],
      [
        "Freezing lowers the water's entropy, but the surroundings' entropy",
        "rises",
        "by more.",
        ["rises", "increases", "goes up", "gains"],
        "eu-4",
        "eu-m1",
      ],
    ],
    hints: [
      [
        "Water freezes at −5 °C. Does ΔS_sys go up or down, and what must be true of ΔS_surr?",
        "The heat released goes into colder surroundings.",
        "ΔS_sys falls; ΔS_surr must rise by more, so ΔS_univ > 0.",
        ["falls", "decrease", "surr", "more", "greater"],
        "eu-4",
        "eu-m1",
      ],
      [
        "At exactly 0 °C, what is ΔS_univ for freezing?",
        "That is equilibrium.",
        "Zero — it is reversible at equilibrium.",
        ["zero", "0"],
        "eu-5",
      ],
    ],
    example:
      "Freezing water lowers the water's entropy while released heat raises the surroundings' entropy by a larger amount below the freezing point.",
    equation: "ΔS_univ = ΔS_sys + ΔS_surr",
    transfer: "Analyse crystallisation in a supercooled liquid using both system and surroundings.",
    dis: [
      d(
        "eu-d1",
        "Does ΔS_sys < 0 contradict the second law?",
        ["Agent view 1", "Yes — entropy of the water decreases, so it is forbidden."],
        ["Agent view 2", "No — only ΔS_univ must be non-negative."],
        "No: only the total ΔS_univ must be non-negative.",
        "The surroundings' entropy gain more than compensates, so the process is allowed.",
        "eu-3",
      ),
    ],
  },
];

const PROB: Spec[] = [
  {
    module: "probability",
    slug: "conditional",
    title: "Conditional probability",
    topic: "conditional probability",
    bloom: "Understand",
    claims: [
      c(
        "cp-1",
        "define",
        "P(A|B) = P(A∩B)/P(B): the probability of A within the population where B is known to have occurred.",
      ),
      c(
        "cp-2",
        "mechanism",
        "Learning B shrinks the reference population to B; conditional probability re-normalises within it.",
      ),
      c(
        "cp-3",
        "pitfall",
        "P(A|B) and P(B|A) answer different questions and are usually different numbers.",
      ),
      c(
        "cp-4",
        "example",
        "Among students who submitted, the fraction who passed is not the fraction of passers who submitted.",
      ),
      c("cp-5", "formula", "P(A∩B) = P(A|B)·P(B)."),
    ],
    mis: [
      m(
        "cp-m1",
        "condition reversed",
        "P(A given B) is the same as P(B given A).",
        "They have different denominators and are linked by Bayes' rule.",
      ),
      m(
        "cp-m2",
        "conditioning confused with 'and'",
        "P(A given B) is the same as P(A and B).",
        "Conditioning divides by P(B) to restrict to the population where B occurred.",
      ),
    ],
    basic: [
      "What does the vertical bar actually mean?",
      "Why do we divide by P(B)?",
      "Is 'A given B' the same as 'A and B'?",
    ],
    probes: [
      "If 90% of positive tests are sick people, does that mean 90% of sick people test positive?",
      "Can P(A|B) be larger than P(A)? What does that tell you?",
    ],
    blanks: [
      [
        "P(A given B) restricts attention to the population where",
        "B",
        "has happened.",
        ["b", "event b"],
        "cp-2",
        "cp-m2",
      ],
      [
        "P(A|B) is computed by dividing P(A∩B) by",
        "P(B)",
        ".",
        ["p(b)", "b", "probability of b"],
        "cp-1",
        "cp-m2",
      ],
    ],
    hints: [
      [
        "Among 200 students, 120 submitted and 90 of those passed. What is P(pass | submitted)?",
        "Restrict attention to the 120.",
        "90/120 = 0.75.",
        ["0.75", "75", "90/120", "3/4"],
        "cp-4",
        "cp-m1",
      ],
      [
        "Is P(pass | submitted) the same as P(submitted | pass)?",
        "Look at the denominators.",
        "Not in general — the conditioning population differs.",
        ["no", "not", "different"],
        "cp-3",
        "cp-m1",
      ],
    ],
    example:
      "Among students who submitted, ask what fraction passed — not what fraction of passers submitted.",
    equation: "P(A|B)=P(A∩B)/P(B)",
    transfer: "Interpret a medical test result by explicitly changing the reference group.",
    dis: [
      d(
        "cp-d1",
        "Is P(A|B) equal to P(B|A)?",
        ["Agent view 1", "Roughly yes when the events are associated."],
        ["Agent view 2", "No — they have different denominators."],
        "No: they are different quantities related by Bayes' rule.",
        "P(A|B) divides by P(B) while P(B|A) divides by P(A); they coincide only when P(A) = P(B).",
        "cp-3",
      ),
    ],
  },
  {
    module: "probability",
    slug: "bayes",
    title: "Base rates and Bayes",
    topic: "Bayes' theorem and base rates",
    bloom: "Apply",
    prereq: ["probability:conditional"],
    claims: [
      c(
        "by-1",
        "define",
        "Bayes' rule: P(A|B) = P(B|A)·P(A)/P(B), combining a prior with the likelihood of the evidence.",
      ),
      c(
        "by-2",
        "mechanism",
        "The base rate determines how many true cases exist to be found, so it shapes how convincing a positive result is.",
      ),
      c(
        "by-3",
        "pitfall",
        "A highly accurate test can still be right only rarely when positive if the condition is rare.",
      ),
      c(
        "by-4",
        "example",
        "With 1% prevalence, 99% sensitivity and a 5% false-positive rate, out of 10,000 people about 99 are true positives and 495 are false positives, so P(sick|positive) ≈ 99/594 ≈ 17%.",
      ),
      c("by-5", "formula", "P(A|B) = P(B|A)P(A) / [P(B|A)P(A) + P(B|¬A)P(¬A)]."),
    ],
    mis: [
      m(
        "by-m1",
        "base rate ignored",
        "A 99%-accurate positive test means a 99% chance of having the condition.",
        "The chance depends on how common the condition is; with a rare condition most positives are false.",
      ),
    ],
    basic: [
      "What is a 'base rate' in plain words?",
      "Why doesn't '99% accurate' mean 99% right?",
      "Why do people use natural frequencies?",
    ],
    probes: [
      "If prevalence rises to 20%, how does P(sick|positive) change — without computing it?",
      "Is sensitivity the same as P(sick | positive)?",
    ],
    blanks: [
      [
        "Out of 10,000 people at 1% prevalence, about",
        "100",
        "people actually have the condition.",
        ["100", "one hundred"],
        "by-4",
        "by-m1",
      ],
      [
        "Ignoring the prior when a test result feels conclusive is called base-rate",
        "neglect",
        ".",
        ["neglect", "fallacy"],
        "by-3",
        "by-m1",
      ],
    ],
    hints: [
      [
        "1% prevalence, 99% sensitivity, 5% false-positive rate. Roughly what fraction of positives are truly sick?",
        "Count out of 10,000: 99 true positives versus 495 false ones.",
        "About 17%.",
        ["17", "16", "18", "one in six", "1/6"],
        "by-4",
        "by-m1",
      ],
      [
        "If prevalence rises to 20%, does P(sick|positive) go up or down?",
        "There are more true cases to find.",
        "Up — a higher prior raises it.",
        ["up", "increase", "higher", "rise"],
        "by-2",
      ],
    ],
    example:
      "Compare 99% sensitivity with a 1% base rate using natural frequencies out of 10,000 people.",
    equation: "P(A|B)=P(B|A)P(A)/P(B)",
    transfer: "Evaluate a rare-defect alarm in a factory where false positives outnumber defects.",
    dis: [
      d(
        "by-d1",
        "Does 99% accuracy imply a 99% chance of disease given a positive?",
        ["Agent view 1", "Yes — the test is 99% accurate."],
        ["Agent view 2", "No — it depends on prevalence."],
        "No: P(sick|positive) depends on the base rate.",
        "Sensitivity is P(positive|sick), not P(sick|positive); with rare disease false positives dominate.",
        "by-3",
      ),
    ],
  },
  {
    module: "probability",
    slug: "independence",
    title: "Independence versus mutual exclusivity",
    topic: "independence and mutual exclusivity",
    bloom: "Understand",
    prereq: ["probability:conditional"],
    claims: [
      c(
        "in-1",
        "define",
        "Events A and B are independent when learning one does not change the probability of the other: P(A∩B) = P(A)P(B).",
      ),
      c("in-2", "define", "Events are mutually exclusive when they cannot both occur: P(A∩B) = 0."),
      c(
        "in-3",
        "pitfall",
        "Mutually exclusive events with positive probability are not independent: knowing one occurred tells you the other did not.",
      ),
      c(
        "in-4",
        "example",
        "Two coin tosses are independent; 'heads' and 'tails' on the same toss are mutually exclusive and therefore dependent.",
      ),
      c("in-5", "mechanism", "Independence is about information; exclusivity is about overlap."),
    ],
    mis: [
      m(
        "in-m1",
        "independent and exclusive treated as the same",
        "Independent and mutually exclusive mean the same thing.",
        "Exclusive events carry maximal information about each other; independent events carry none.",
      ),
    ],
    basic: [
      "They both sound like 'unrelated' — what is the difference?",
      "Can events be both independent and mutually exclusive?",
      "How do I check independence with numbers?",
    ],
    probes: [
      "If P(A)=0.3, P(B)=0.4 and they are exclusive, what is P(A|B)? Are they independent?",
      "When, if ever, can two exclusive events be independent?",
    ],
    blanks: [
      [
        "Mutually exclusive events have P(A∩B) equal to",
        "zero",
        ".",
        ["zero", "0"],
        "in-2",
        "in-m1",
      ],
      [
        "Events are independent when P(A∩B) equals P(A) times",
        "P(B)",
        ".",
        ["p(b)", "b"],
        "in-1",
        "in-m1",
      ],
    ],
    hints: [
      [
        "On a single die roll, are 'even' and 'odd' independent?",
        "If it is even, what is the chance it is odd?",
        "No — they are mutually exclusive, so knowing one rules out the other.",
        ["no", "dependent", "exclusive"],
        "in-3",
        "in-m1",
      ],
      [
        "Two separate fair coin tosses — independent?",
        "Does the first toss change the second?",
        "Yes — they are independent.",
        ["yes", "independent"],
        "in-4",
      ],
    ],
    example: "Two coin tosses are independent; drawing two cards without replacement is not.",
    equation: "P(A∩B)=P(A)P(B)",
    transfer:
      "Decide whether failures in two redundant sensors are independent when both share a power supply.",
    dis: [
      d(
        "in-d1",
        "Can mutually exclusive events with positive probability be independent?",
        ["Agent view 1", "Yes — they share no outcomes, so they are unrelated."],
        ["Agent view 2", "No — one occurring rules out the other."],
        "No: P(A|B) = 0 ≠ P(A), so they are dependent.",
        "Independence requires P(A|B) = P(A); for exclusive events P(A|B) = 0.",
        "in-3",
      ),
    ],
  },
  {
    module: "probability",
    slug: "sampling",
    title: "Sampling distributions and standard error",
    topic: "sampling distributions",
    bloom: "Apply",
    claims: [
      c(
        "sd-1",
        "define",
        "A sampling distribution describes how a statistic, such as the sample mean, varies across repeated samples from the same population.",
      ),
      c(
        "sd-2",
        "mechanism",
        "The standard error of the mean is σ/√n: it measures the spread of sample means, not the spread of individual data.",
      ),
      c(
        "sd-3",
        "pitfall",
        "The standard deviation of the data and the standard error of the mean are different objects.",
      ),
      c("sd-4", "example", "Quadrupling the sample size halves the standard error, since √4 = 2."),
      c(
        "sd-5",
        "boundary",
        "By the central limit theorem, means of large samples are approximately normal even when individual values are skewed.",
      ),
    ],
    mis: [
      m(
        "sd-m1",
        "standard error confused with data spread",
        "Standard error is just the standard deviation of the data.",
        "The standard error is the spread of the sample mean across samples and shrinks with √n.",
      ),
    ],
    basic: [
      "Is standard error the same as standard deviation?",
      "What does 'repeated samples' mean when I only have one?",
      "Why does the mean get steadier with more data?",
    ],
    probes: [
      "If the data are very skewed, can the sample mean still be nearly normal?",
      "Does a bigger sample shrink the standard deviation of the data?",
    ],
    blanks: [
      [
        "The standard error of the mean equals σ divided by the square root of",
        "n",
        ".",
        ["n", "sample size", "the sample size"],
        "sd-2",
        "sd-m1",
      ],
      [
        "A sampling distribution describes how a",
        "statistic",
        "varies across repeated samples.",
        ["statistic", "sample mean", "estimate"],
        "sd-1",
      ],
    ],
    hints: [
      [
        "If you quadruple the sample size, what happens to the standard error of the mean?",
        "Think of √4.",
        "It halves.",
        ["half", "halves", "1/2", "0.5", "50"],
        "sd-4",
      ],
      [
        "Does collecting more data change the standard deviation of individual observations?",
        "Spread of the data versus spread of the mean.",
        "No — only the standard error of the mean shrinks.",
        ["no", "only", "standard error"],
        "sd-3",
        "sd-m1",
      ],
    ],
    example:
      "Individual wait times may be skewed while means of large samples become more nearly normal.",
    equation: "SE(x̄)=σ/√n",
    transfer: "Predict how quadrupling sample size changes uncertainty in a mean estimate.",
    dis: [
      d(
        "sd-d1",
        "Does more data reduce the variability of individual values?",
        ["Agent view 1", "Yes — more data makes everything less variable."],
        ["Agent view 2", "No — only the sample mean becomes steadier."],
        "No: individual values keep their spread; the mean's spread shrinks.",
        "σ describes the population; σ/√n describes the sample mean.",
        "sd-3",
      ),
    ],
  },
  {
    module: "probability",
    slug: "correlation",
    title: "Correlation and causation in a fitted model",
    topic: "correlation and causation",
    bloom: "Analyse",
    claims: [
      c(
        "cc-1",
        "define",
        "A correlation or regression coefficient describes association — how variables co-vary in the data.",
      ),
      c(
        "cc-2",
        "mechanism",
        "A causal claim needs confounding, reverse causation and selection effects to be ruled out, ideally by intervention or randomisation.",
      ),
      c(
        "cc-3",
        "pitfall",
        "A fitted coefficient is not automatically the effect of changing its predictor.",
      ),
      c(
        "cc-4",
        "example",
        "Ice-cream sales and drownings both rise with temperature; temperature is a confounder and neither causes the other.",
      ),
      c(
        "cc-5",
        "boundary",
        "Randomising the predictor breaks its link with confounders, so the coefficient can then be read causally.",
      ),
    ],
    mis: [
      m(
        "cc-m1",
        "coefficient read as a causal effect",
        "If the regression coefficient is significant, changing X will change Y by that amount.",
        "A coefficient is an association; only intervention or randomisation licenses a causal reading.",
      ),
    ],
    basic: [
      "If two things move together, why isn't one causing the other?",
      "What is a confounder?",
      "What would convince us it really is causal?",
    ],
    probes: [
      "Could study-app use and grades be linked because motivated students do both? How would you test that?",
      "Does controlling for more variables always remove confounding?",
    ],
    blanks: [
      [
        "A variable that influences both X and Y and creates a spurious association is called a",
        "confounder",
        ".",
        ["confounder", "confounding variable", "confounding"],
        "cc-4",
        "cc-m1",
      ],
      [
        "Randomly assigning the predictor breaks its link with",
        "confounding",
        "variables.",
        ["confounding", "confounders", "lurking", "other"],
        "cc-5",
      ],
    ],
    hints: [
      [
        "Ice-cream sales and drownings are correlated. What most plausibly explains it?",
        "What rises in summer?",
        "A shared cause — hot weather, a confounder.",
        ["temperature", "weather", "summer", "confound", "heat"],
        "cc-4",
        "cc-m1",
      ],
      [
        "A regression of grades on app use has a positive coefficient. Does that prove the app raises grades?",
        "Who chooses to use the app?",
        "No — motivated students may both use it and score higher; association is not intervention.",
        ["no", "motivat", "confound", "select"],
        "cc-3",
        "cc-m1",
      ],
    ],
    example: "Ice-cream sales and drowning both rise with temperature; neither causes the other.",
    equation: "association ≠ intervention effect",
    transfer:
      "A study links study-app use with grades. Name two alternative explanations and design stronger evidence.",
    dis: [
      d(
        "cc-d1",
        "Can a significant coefficient establish causation?",
        ["Agent view 1", "Yes — it is statistically significant."],
        ["Agent view 2", "No — significance concerns noise, not confounding."],
        "No: significance says the association is unlikely to be chance, not that it is causal.",
        "Confounding and selection survive any significance level.",
        "cc-3",
      ),
    ],
  },
];

export const SEEDED: VerifiedRecord[] = [...THERMO, ...PROB].map(rec);
export const seededByKey = new Map(SEEDED.map((r) => [r.key, r]));
export const PILOT_MODULES = [
  {
    slug: "thermodynamics",
    code: "ME 201",
    title: "Thermodynamics",
    description:
      "Track energy, entropy, direction and system boundaries across realistic engineering situations.",
  },
  {
    slug: "probability",
    code: "DS 203",
    title: "Probability & Statistics",
    description:
      "Reason under uncertainty, distinguish dependence, and interpret evidence without causal shortcuts.",
  },
];
// Same-tier pairs for the comparative study (HLD §6.4)
export const STUDY_PAIRS: Array<{
  id: string;
  module: string;
  bloom: Bloom;
  concepts: [string, string];
}> = [
  {
    id: "thermo-apply",
    module: "thermodynamics",
    bloom: "Apply",
    concepts: ["thermodynamics:first-law", "thermodynamics:sign-conventions"],
  },
  {
    id: "thermo-analyse",
    module: "thermodynamics",
    bloom: "Analyse",
    concepts: ["thermodynamics:reversibility", "thermodynamics:entropy-universe"],
  },
  {
    id: "prob-understand",
    module: "probability",
    bloom: "Understand",
    concepts: ["probability:conditional", "probability:independence"],
  },
  {
    id: "prob-apply",
    module: "probability",
    bloom: "Apply",
    concepts: ["probability:bayes", "probability:sampling"],
  },
];
