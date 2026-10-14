using UnityEngine;

namespace AIKyro
{
    /// Plays one concept's eight-stage arc on a timer so the project demos on its
    /// own, with no web app attached. Disable this once React is driving the build.
    [RequireComponent(typeof(ClassroomBuilder))]
    public class DemoDriver : MonoBehaviour
    {
        public bool autoPlay = true;
        public float secondsPerStage = 5f;

        static readonly StagePayload[] Arc =
        {
            new StagePayload { speaker = "teacher", kind = "question", board = "the second law", text = "Before we begin, what do you already believe is true here?" },
            new StagePayload { speaker = "teacher", kind = "explain", board = "ΔS_universe ≥ 0", text = "Total entropy of an isolated system cannot decrease." },
            new StagePayload { speaker = "maya", kind = "example", board = "ΔS_universe ≥ 0", text = "Hot coffee cools because energy disperses into the room." },
            new StagePayload { speaker = "arjun", kind = "challenge", board = "Test the boundary", text = "Entropy is not simply disorder — it counts how energy spreads." },
            new StagePayload { speaker = "teacher", kind = "predict", board = "Predict → justify → test", text = "Predict the outcome before we reveal the reasoning." },
            new StagePayload { speaker = "teacher", kind = "checkpoint", board = "Claim + mechanism + evidence", text = "Explain the second law in your own words." },
            new StagePayload { speaker = "maya", kind = "teachback", board = "Teach-back", text = "Teach the idea back to me without repeating the definition." },
            new StagePayload { speaker = "arjun", kind = "transfer", board = "New situation — same principle", text = "A refrigerator moves heat from cold to hot. Why is that allowed?" },
        };

        ClassroomDirector director;
        int index;
        float elapsed;

        void Start()
        {
            director = GetComponent<ClassroomBuilder>().Director;
            Show(0);
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.RightArrow)) { Show(index + 1); return; }
            if (Input.GetKeyDown(KeyCode.LeftArrow)) { Show(index - 1); return; }
            if (!autoPlay) return;

            elapsed += Time.deltaTime;
            if (elapsed < secondsPerStage) return;

            elapsed = 0f;
            Show(index + 1);
        }

        void Show(int next)
        {
            if (director == null) return;
            index = (next % Arc.Length + Arc.Length) % Arc.Length;
            elapsed = 0f;
            director.SetStage(Arc[index]);
        }

        void OnGUI()
        {
            var stage = Arc[index];
            var style = new GUIStyle(GUI.skin.box)
            {
                alignment = TextAnchor.MiddleLeft,
                wordWrap = true,
                fontSize = 15,
                padding = new RectOffset(14, 14, 12, 12)
            };

            var name = stage.speaker == "teacher" ? "Dr Rao" : stage.speaker == "maya" ? "Maya · foundational learner" : "Arjun · probing learner";
            GUI.Box(new Rect(24, Screen.height - 128, Screen.width - 48, 104), $"{stage.kind.ToUpper()}\n\n{name}\n{stage.text}", style);
            GUI.Label(new Rect(24, 18, 420, 24), $"Stage {index + 1} of {Arc.Length}   ←/→ to step");
        }
    }
}
