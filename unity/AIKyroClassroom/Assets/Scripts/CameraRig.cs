using UnityEngine;

namespace AIKyro
{
    /// Same three framings as the web scene. Student shots sit on the board side
    /// looking back at the learner, high enough that the desk in front never
    /// crosses the sight line — the bug the client saw in the React version.
    public class CameraRig : MonoBehaviour
    {
        struct Shot
        {
            public Vector3 Position;
            public Vector3 LookAt;
        }

        static readonly Shot TeacherShot = new Shot { Position = new Vector3(0f, 3.0f, 7.4f), LookAt = new Vector3(0f, 2.5f, -4.4f) };
        static readonly Shot MayaShot = new Shot { Position = new Vector3(-0.7f, 2.4f, -2.6f), LookAt = new Vector3(-2.8f, 1.3f, 0.62f) };
        static readonly Shot ArjunShot = new Shot { Position = new Vector3(0.7f, 2.4f, -2.6f), LookAt = new Vector3(2.8f, 1.3f, 0.62f) };

        [Tooltip("Higher is snappier. 2.2 matches the web scene's cut speed.")]
        public float followSpeed = 2.2f;

        Shot target = TeacherShot;
        Vector3 currentLookAt = TeacherShot.LookAt;

        void Start()
        {
            var camera = GetComponent<Camera>();
            if (camera != null) camera.fieldOfView = 46f;

            transform.position = target.Position;
            transform.LookAt(currentLookAt);
        }

        public void FrameSpeaker(Speaker speaker)
        {
            target = speaker switch
            {
                Speaker.Maya => MayaShot,
                Speaker.Arjun => ArjunShot,
                _ => TeacherShot
            };
        }

        void LateUpdate()
        {
            var k = 1f - Mathf.Exp(-followSpeed * Mathf.Min(Time.deltaTime, 0.05f));
            transform.position = Vector3.Lerp(transform.position, target.Position, k);
            currentLookAt = Vector3.Lerp(currentLookAt, target.LookAt, k);
            transform.LookAt(currentLookAt);
        }
    }
}
