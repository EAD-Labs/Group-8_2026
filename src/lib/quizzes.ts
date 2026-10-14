export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  conceptSlug: string;
};

export type ModuleQuiz = {
  moduleSlug: string;
  questions: QuizQuestion[];
};

export const moduleQuizzes: Record<string, ModuleQuiz> = {
  thermodynamics: {
    moduleSlug: "thermodynamics",
    questions: [
      {
        id: "thermo-1",
        conceptSlug: "first-law",
        question: "For a closed system using ΔU = Q − W, what does positive W mean?",
        options: ["Work is done on the system", "Work is done by the system", "Heat leaves the system", "Internal energy is zero"],
        answer: 1,
        explanation: "With ΔU = Q − W, positive W represents work done by the system, so it reduces the system's internal energy for the same Q.",
      },
      {
        id: "thermo-2",
        conceptSlug: "second-law",
        question: "Which statement is consistent with the second law for an isolated system?",
        options: ["Total entropy can never decrease", "Total entropy must always be zero", "Energy must disappear in every real process", "Every process must be reversible"],
        answer: 0,
        explanation: "For an isolated system, total entropy cannot decrease: ΔS_universe ≥ 0.",
      },
      {
        id: "thermo-3",
        conceptSlug: "sign-conventions",
        question: "Using ΔU = Q − W, a gas is compressed while losing heat. Which signs are correct?",
        options: ["Q positive, W positive", "Q negative, W positive", "Q negative, W negative", "Q positive, W negative"],
        answer: 2,
        explanation: "Heat leaves the system, so Q is negative. Compression means work is done on the system, so W is negative under this convention.",
      },
      {
        id: "thermo-4",
        conceptSlug: "reversibility",
        question: "Which condition best describes an ideal reversible process?",
        options: ["It produces maximum entropy", "It can be reversed with no net change to system and surroundings", "It always happens quickly", "It requires zero energy transfer"],
        answer: 1,
        explanation: "A reversible process is an ideal limiting path that can be reversed by an infinitesimal change without leaving a net change in the system and surroundings.",
      },
      {
        id: "thermo-5",
        conceptSlug: "entropy-universe",
        question: "A spontaneous process can decrease the entropy of the system when…",
        options: ["the surroundings gain enough entropy to keep total entropy non-decreasing", "energy is destroyed", "the second law is suspended", "the system is always isolated"],
        answer: 0,
        explanation: "A system's entropy may decrease during a spontaneous process as long as the surroundings gain enough entropy that ΔS_universe remains non-negative.",
      },
    ],
  },
  probability: {
    moduleSlug: "probability",
    questions: [
      {
        id: "prob-1",
        conceptSlug: "conditional",
        question: "What does P(A|B) describe?",
        options: ["Probability of B given A", "Probability of A given B", "Probability of A and B being impossible", "Probability of A or B only"],
        answer: 1,
        explanation: "P(A|B) asks for the probability of A after restricting the reference population to cases where B occurred.",
      },
      {
        id: "prob-2",
        conceptSlug: "bayes",
        question: "Why can a highly accurate medical test still have a low positive predictive value?",
        options: ["The test cannot have sensitivity", "The disease prevalence may be very low", "Bayes' theorem ignores evidence", "Positive results are always random"],
        answer: 1,
        explanation: "When prevalence is tiny, false positives can outnumber true positives even when a test is highly accurate.",
      },
      {
        id: "prob-3",
        conceptSlug: "independence",
        question: "For independent events A and B, which relationship holds?",
        options: ["P(A∩B)=P(A)+P(B)", "P(A∩B)=P(A)P(B)", "P(A|B)=0", "P(A)=P(B)"],
        answer: 1,
        explanation: "Independence means learning B does not change the probability of A, giving P(A∩B)=P(A)P(B).",
      },
      {
        id: "prob-4",
        conceptSlug: "expectation",
        question: "A fair six-sided die has expectation 3.5. What does that mean?",
        options: ["Every roll is 3.5", "3.5 must appear on the die", "3.5 is the probability-weighted long-run average", "Half the rolls are exactly 3.5"],
        answer: 2,
        explanation: "Expectation is a probability-weighted long-run average; it does not need to be a value that any individual trial can take.",
      },
      {
        id: "prob-5",
        conceptSlug: "correlation",
        question: "Ice-cream sales and drowning incidents both increase in summer. What is the safest conclusion?",
        options: ["Ice cream causes drowning", "Drowning causes ice-cream sales", "The association alone does not establish causation", "The variables must be independent"],
        answer: 2,
        explanation: "Both can be associated with a third variable such as temperature. Association alone is not enough to establish a causal effect.",
      },
    ],
  },
};
