# AI KYRO — Unity classroom

A Unity version of the metacognitive classroom, built to answer the client's
question from the 7 October meeting: *can the classroom be built in Unity, and
how would it connect to the web app?*

The whole room is generated from code at startup, so there is no scene file to
merge, no binary assets in the repo, and no art pipeline to set up before you
can see something. Open it, press Play, and a lesson runs.

## Run it (about two minutes)

1. Unity Hub → **Add** → select this folder (`unity/AIKyroClassroom`).
   Built against **Unity 6.3 LTS (6000.3.26f1)**; any 2022.3 LTS or newer also works.
   No extra build modules are needed to run it in the editor — WebGL Build Support
   is only required when you build for the browser.
2. Open the project. Unity creates `Library/` on first import — this takes a few minutes once.
3. `File → New Scene → Basic (Built-in)`.
4. `GameObject → Create Empty`. **Rename it to `ClassroomDirector`** — the web
   bridge addresses it by name, so the name matters.
5. With it selected, `Add Component → Classroom Builder`, then
   `Add Component → Demo Driver`.
6. Press **Play**.

You get the full room — chalkboard, desks, bookshelf, posters, windows, ceiling
lights — with the camera cutting between Dr Rao, Maya and Arjun as the lesson
advances. `←` / `→` step through the eight stages by hand; untick *Auto Play* on
the Demo Driver to stop the timer.

Save the scene as `Assets/Classroom.unity` so you don't repeat steps 3–5.

## What's here

| File | Does |
|---|---|
| `ClassroomBuilder.cs` | Generates the entire room from primitives at `Awake()` |
| `ClassroomDirector.cs` | Applies a stage: cuts camera, writes the board, flags the speaker |
| `CameraRig.cs` | The three camera framings, smoothly interpolated |
| `SpeakerAvatar.cs` | Speaking ring, breathing bob, `Speaking` animator bool |
| `ClassroomPalette.cs` | The same colours as the web scene |
| `DemoDriver.cs` | Plays one concept's 8-stage arc so the project demos standalone |
| `WebBridge.cs` + `KyroBridge.jslib` | Unity → browser events |

Coordinates and palette are copied from
`src/components/classroom/ClassroomScene.tsx`, so this is recognisably the same
room as the live site rather than a different product.

## Better-looking characters

The built-in figures are jointed primitives — head, hair, torso, arms, legs, with
the students actually seated at their desks. Readable, but not production art.
To swap in real ones:

1. Import rigged humanoid models (Mixamo is free; export FBX *with* skin).
2. Set each model's rig to **Humanoid** in the import inspector.
3. Drag the prefabs onto **Teacher / Maya / Arjun Prefab** on the Classroom Builder.
4. Give each an Animator Controller with an idle state and a talking state,
   transitioning on a `bool` called `Speaking` — `SpeakerAvatar` already sets it.

This is the step that fixes the biggest complaint about the current web
classroom: the existing `.glb` characters are a low-poly **combat** pack with no
talking, pointing or sitting animations, which is why Maya waves mid-sentence.

## Connecting it to the website (later)

The seam already exists. `ClassroomScene` in the React app takes exactly two
props — `speaker` and `board` — so Unity can be swapped in as a different
renderer without touching state, AI, auth or evaluation.

**Build:** `File → Build Settings → WebGL`, Compression **Brotli**,
output to `public/unity/`.

**Embed:**

```bash
npm i react-unity-webgl
```

```tsx
import { Unity, useUnityContext } from "react-unity-webgl";

export function UnityClassroom({ speaker, board }: { speaker: string; board: string }) {
  const { unityProvider, sendMessage, isLoaded } = useUnityContext({
    loaderUrl: "/unity/Build/unity.loader.js",
    dataUrl: "/unity/Build/unity.data.br",
    frameworkUrl: "/unity/Build/unity.framework.js.br",
    codeUrl: "/unity/Build/unity.wasm.br",
  });

  useEffect(() => {
    if (!isLoaded) return;
    sendMessage("ClassroomDirector", "SetStageJson", JSON.stringify({ speaker, board }));
  }, [isLoaded, speaker, board, sendMessage]);

  return <Unity unityProvider={unityProvider} style={{ width: "100%", height: "100%" }} />;
}
```

Unity talks back through `KyroBridge.jslib`:

```ts
window.addEventListener("kyro", e => {
  const { event, payload } = (e as CustomEvent).detail;
});
```

### Three things to settle before committing to the swap

1. **Unity WebGL does not support mobile browsers.** The current React
   classroom works on phones. Keep `ClassroomScene` as the mobile path.
2. **Payload.** A WebGL build is several MB compressed with a visible engine
   boot; the React scene renders almost immediately. Measure before deciding.
3. **Repo size.** Build output is large binaries. Put `public/unity/` behind
   Git LFS or a CDN — this repo round-trips through Lovable, and bloating it
   will slow that sync down.

`.gitignore` already excludes `Library/`, `Temp/` and `Build/`, so only source
is committed.
