using System.Runtime.InteropServices;
using UnityEngine;

namespace AIKyro
{
    /// Unity → React. React → Unity goes the other way, through
    /// UnityInstance.SendMessage("ClassroomDirector", "SetStageJson", json).
    public class WebBridge : MonoBehaviour
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void KyroEmit(string eventName, string payloadJson);
#else
        static void KyroEmit(string eventName, string payloadJson)
        {
            Debug.Log($"[AI KYRO] {eventName} {payloadJson}");
        }
#endif

        /// Tells the page the WebGL build is live and ready for its first stage.
        void Start() => KyroEmit("ClassroomReady", "{}");

        public void ReportStageShown(string conceptSlug, int stageIndex)
        {
            KyroEmit("StageShown", JsonUtility.ToJson(new StageEvent { conceptSlug = conceptSlug, stageIndex = stageIndex }));
        }

        [System.Serializable]
        class StageEvent
        {
            public string conceptSlug;
            public int stageIndex;
        }
    }
}
