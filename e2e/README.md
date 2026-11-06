# End-to-end tests

Drive the real app in a real browser (Chromium via puppeteer-core). They check the HLD behaviours and save screenshots of each step.

```bash
npm install                 # installs puppeteer-core + @sparticuz/chromium
npm run dev                 # in one terminal (http://127.0.0.1:8080)
npm run test:e2e            # in another; screenshots go to ./e2e-shots
```
* Use your own Chrome/Chromium: `CHROME_PATH="/path/to/chrome" npm run test:e2e` (the bundled build is Linux x64 only).
* Another URL: `BASE_URL=http://localhost:3000/`. Another screenshot folder: `SHOTS=./shots`.
* `journey.ts` = the full user journey (HLD §5.1, T2.x, T3.1–T3.2); `study.ts` = comparative study + evaluation; `speech.ts` = speech signal (uses a synthesized microphone and a stand-in recognizer); `settings-e2e.mjs`, `popup.mjs`, `ask.mjs`, `review.mjs`, `library-e2e.mjs`, `enlarge.mjs` = the earlier features.
* Run times are a few minutes each: the 3D scene renders in software. The tests use Low graphics and reduced motion.
* `live-verify.ts` starts its own copy of the app on port 5199 together with a local stand-in for the app's one AI, so it needs no API key: `npx tsx e2e/live-verify.ts` (also `npm run test:e2e:live`). `keyboard.mjs` = keyboard-only use; `a11y.mjs` = axe-core scan of every screen in both themes.
