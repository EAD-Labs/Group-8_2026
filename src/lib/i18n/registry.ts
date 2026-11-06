// Supported languages. Adding one is a data change: add a row here. Languages that have no bundled
// dictionary (see index.ts STATIC) are translated by the AI on first use and cached.

export type LangCode =
  "en" | "hi" | "mr" | "bn" | "ta" | "te" | "gu" | "kn" | "ml" | "pa" | "es" | "fr";

export type LangInfo = {
  code: LangCode;
  /** English name, used in AI prompts */
  name: string;
  /** name written in the language itself, shown in the picker */
  native: string;
  /** BCP-47 tag for speech synthesis and recognition */
  speech: string;
  /** tesseract.js language pack for offline OCR of printed scans */
  tess: string;
  /** words/phrases that signal explanation ("because", "therefore") for the offline grader */
  reasoning: string[];
};

export const LANGS: LangInfo[] = [
  {
    code: "en",
    name: "English",
    native: "English",
    speech: "en-IN",
    tess: "eng",
    reasoning: [
      "because",
      "therefore",
      "since",
      "hence",
      "thus",
      "so that",
      "which means",
      "as a result",
      "leads to",
      "causes",
      "implies",
      "due to",
      "this is why",
    ],
  },
  {
    code: "hi",
    name: "Hindi",
    native: "हिन्दी",
    speech: "hi-IN",
    tess: "hin",
    reasoning: ["क्योंकि", "इसलिए", "अतः", "जिससे", "कारण", "फलस्वरूप"],
  },
  {
    code: "mr",
    name: "Marathi",
    native: "मराठी",
    speech: "mr-IN",
    tess: "mar",
    reasoning: ["कारण", "म्हणून", "त्यामुळे", "यामुळे", "सबब"],
  },
  {
    code: "bn",
    name: "Bengali",
    native: "বাংলা",
    speech: "bn-IN",
    tess: "ben",
    reasoning: ["কারণ", "তাই", "সুতরাং", "ফলে", "অতএব"],
  },
  {
    code: "ta",
    name: "Tamil",
    native: "தமிழ்",
    speech: "ta-IN",
    tess: "tam",
    reasoning: ["ஏனெனில்", "எனவே", "அதனால்", "ஆகையால்"],
  },
  {
    code: "te",
    name: "Telugu",
    native: "తెలుగు",
    speech: "te-IN",
    tess: "tel",
    reasoning: ["ఎందుకంటే", "కాబట్టి", "అందువల్ల", "అందుకే"],
  },
  {
    code: "gu",
    name: "Gujarati",
    native: "ગુજરાતી",
    speech: "gu-IN",
    tess: "guj",
    reasoning: ["કારણ કે", "તેથી", "માટે"],
  },
  {
    code: "kn",
    name: "Kannada",
    native: "ಕನ್ನಡ",
    speech: "kn-IN",
    tess: "kan",
    reasoning: ["ಏಕೆಂದರೆ", "ಆದ್ದರಿಂದ", "ಹೀಗಾಗಿ"],
  },
  {
    code: "ml",
    name: "Malayalam",
    native: "മലയാളം",
    speech: "ml-IN",
    tess: "mal",
    reasoning: ["കാരണം", "അതിനാൽ", "അതുകൊണ്ട്"],
  },
  {
    code: "pa",
    name: "Punjabi",
    native: "ਪੰਜਾਬੀ",
    speech: "pa-IN",
    tess: "pan",
    reasoning: ["ਕਿਉਂਕਿ", "ਇਸ ਲਈ", "ਇਸੇ ਕਰਕੇ"],
  },
  {
    code: "es",
    name: "Spanish",
    native: "Español",
    speech: "es-ES",
    tess: "spa",
    reasoning: ["porque", "por lo tanto", "ya que", "así que", "debido a"],
  },
  {
    code: "fr",
    name: "French",
    native: "Français",
    speech: "fr-FR",
    tess: "fra",
    reasoning: ["parce que", "donc", "car", "puisque", "par conséquent"],
  },
];

export const langInfo = (code: string): LangInfo =>
  LANGS.find((l) => l.code === code) ?? (LANGS[0] as LangInfo);

export const isLangCode = (v: unknown): v is LangCode => LANGS.some((l) => l.code === v);
