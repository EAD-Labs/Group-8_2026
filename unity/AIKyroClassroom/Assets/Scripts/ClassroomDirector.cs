using System;
using UnityEngine;

namespace AIKyro
{
    /// The contract with the web app. Mirrors LessonStage in src/lib/curriculum.ts,
    /// so React stays the brain and Unity is only the renderer.
    [Serializable]
    public class StagePayload
    {
        public string speaker = "teacher";
        public string board = "";
        public string text = "";
        public string kind = "explain";

        public Speaker Role => speaker switch
        {
            "maya" => Speaker.Maya,
            "arjun" => Speaker.Arjun,
            _ => Speaker.Teacher
        };
    }

    /// Applies a stage to the room: cuts the camera, writes the board, flags the
    /// speaker. Everything the web app can ask Unity to do goes through here.
    public class ClassroomDirector : MonoBehaviour
    {
        CameraRig rig;
        BoardText board;
        SpeakerAvatar teacher;
        SpeakerAvatar maya;
        SpeakerAvatar arjun;

        public StagePayload Current { get; private set; } = new StagePayload();

        public void Configure(CameraRig cameraRig, BoardText boardText, SpeakerAvatar teacherAvatar, SpeakerAvatar mayaAvatar, SpeakerAvatar arjunAvatar)
        {
            rig = cameraRig;
            board = boardText;
            teacher = teacherAvatar;
            maya = mayaAvatar;
            arjun = arjunAvatar;
            Apply(Current);
        }

        public void SetStage(StagePayload payload)
        {
            if (payload == null) return;
            Current = payload;
            Apply(payload);
        }

        /// Entry point for UnityInstance.SendMessage("ClassroomDirector", "SetStageJson", json)
        public void SetStageJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return;

            try
            {
                SetStage(JsonUtility.FromJson<StagePayload>(json));
            }
            catch (Exception error)
            {
                Debug.LogWarning($"[AI KYRO] Could not read stage payload: {error.Message}");
            }
        }

        void Apply(StagePayload payload)
        {
            if (rig != null) rig.FrameSpeaker(payload.Role);
            if (board != null) board.SetText(payload.board);

            if (teacher != null) teacher.SetSpeaking(payload.Role == Speaker.Teacher);
            if (maya != null) maya.SetSpeaking(payload.Role == Speaker.Maya);
            if (arjun != null) arjun.SetSpeaking(payload.Role == Speaker.Arjun);
        }
    }
}
