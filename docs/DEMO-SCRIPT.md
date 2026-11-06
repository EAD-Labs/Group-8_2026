# User-journey demo script (≈ 8 minutes)

This follows HLD §5.1 (steps 1–6) and shows each acceptance behaviour on screen. Everything here works **without the AI** (pilot topics are pre-verified; the third-student answer falls back to the verified record). Step 2b needs the app's AI configured.

**Before you start:** open the app, *Settings → Reset progress* (clean learner), *Settings → Demo clock → Reset*. Optional: turn **Graphics → Low** on a weak laptop. Use Chrome or Edge (voice needs it). Screenshots of every step from an automated run are in `docs/demo-screens/`.

| # | Do | Say / point out | You should see |
|---|---|---|---|
| 0 | Dashboard → **▶ Start the guided demo** | “A checklist follows what we actually do.” | A *User journey* card, step 1 highlighted. |
| 1 | Click the hero (**Enter class**) → **Topic Setup**. Pick **Second law & entropy**. Leave **Full class**. | “Ten pilot concepts, two modules; each has a target Bloom level.” | 10 topic cards; right panel says *Pre-verified record · 5 addressable claims · 1 disagreement resolved*. |
| 2 | Open **Settings → Verified knowledge → Open records** (or class toolbar **How verified**). Expand *Second law & entropy*. | “One trustworthy account per topic. Each record shows who produced it, what was corrected or disputed, how it was settled and why.” | Resolved disagreement with positions, resolution, reasoning; claims table with ids. |
| 2b | *(needs the app's AI)* Topic Setup → type **Carnot efficiency** → **Verify & prepare**. | “The AI drafts the topic, then reviews its own draft and corrects mistakes — confidence stays at medium because one model checking itself can't be certain.” | Five steps tick off live; “drafted and reviewed by the AI, N corrections made”; the record, with first-draft vs review, appears in Verified knowledge. |
| 3 | **Start class**. | “Teacher, a basic student who asks what we’re too shy to ask, and an advanced student who probes.” | 21-turn class; Maya: “Is entropy just a fancy word for mess?”; Arjun challenges. |
| 4a | Reach **FILL THE BLANK**. Try the **Next** arrow. Type a wrong word, **Check**. | “The class will not move on until we attempt the blank.” | Next arrow disabled; wrong word marked, right word shown; a doubt is logged. |
| 4a2 | Reach **QUICK CHECK** (a popup with choices). Pick a wrong option → **Check answer**; later pick the right one. Also tap **Hint** on the first question. | “Quick checks pop up mid-class; a slip is logged as a named doubt. The Hint button nudges without answering.” | Right/wrong marked, explanation, +2 points for a right first answer. |
| 4b | Reach **HINT · GUESS FIRST**. Note “Reveal answer” isn’t available. Type a guess → **Commit guess** → **Reveal answer**. | “A guess is required first; points only for guessing before the reveal.” | “Your guess matched — +3 points.” |
| 4c | Reload the page (F5) and open **Classroom**. | “A dropped connection doesn’t lose our place.” | Same turn, same points. |
| 5 | Type in **ASK A DOUBT**: “Why does the coffee never reheat itself?” | “We’re the third student; the answer refers to what was said.” | Answer starts “…connects to what Maya said a moment ago: “…” ” |
| 6a | Continue to the **CHECKPOINT**. Try Next. Answer it. | “One mandatory checkpoint, drawn from *this* dialogue.” | Next disabled; question quotes Arjun’s probe; scored result. |
| 6b | Open **Report Card**. | “Progress is per concept, by evidence, never time spent.” | Ladder: *Second law* at **Understood**, “next delayed check in 3 days”; the named open doubt; points; a badge. |
| 6c | **Review** → note nothing is due. **Settings → Demo clock → +3 days**. **Review** again. | “We can’t wait three days on stage, so we fast-forward the clock — it only shifts how the app reads the date.” | “1 concept due”. |
| 6d | Take the review quiz (answer correctly). Back to **Report Card**. | “Passing the delayed check is the only route to Retained.” | *Second law* now **Retained**; the earlier doubt closed; journey card shows complete. |
| 7 | *(optional)* **Teach-back** with the microphone (Topic Setup → turn on *Speech signal*). Press the mic, explain aloud, press again. | “Speech rate and pauses show where understanding thins. Nothing is recorded or uploaded.” | Gap report: coverage %, pace, “Long pause (2.3 s) before “isolated””. |
| 8 | **Settings → Comparative study → Join** (participant 1). | “Within-learner comparison: one concept in the classroom, a matched one in plain chat, same time, tested days later.” | Assignment cards; the plain-chat condition has no personas/hints/blanks. |
| 9 | **Settings → Evaluation report → Show with synthetic demo data**. | “This is what the pilot report will look like — **synthetic data, not a result**.” | Red SYNTHETIC banner; retention and transfer deltas with 95% CI, p, effect size; “reportable (≥15)”. |

## If something goes wrong
* **“AI is not configured”** — expected without keys; the demo does not need them except step 2b.
* **Mic not working** — typing works identically; skip step 7.
* **Stuck state** — *Settings → Reset progress* (also resets the demo clock and the learner model).
* Don’t present anything labelled *synthetic* as a pilot result.
