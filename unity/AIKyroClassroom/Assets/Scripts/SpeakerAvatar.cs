using UnityEngine;

namespace AIKyro
{
    public enum Speaker { Teacher, Maya, Arjun }

    /// Drives the "who is talking" read: a pulsing floor ring and a slightly faster
    /// breathing bob, matching the web scene. If a real rigged model is assigned,
    /// its Animator is driven through the "Speaking" bool instead of the bob.
    public class SpeakerAvatar : MonoBehaviour
    {
        public Speaker Role { get; private set; }

        bool canSpeak;
        bool speaking;
        float phase;
        float baseY;
        GameObject ring;
        Animator animator;

        public void Configure(Speaker role, bool canSpeak, Color ringColour)
        {
            Role = role;
            this.canSpeak = canSpeak;
            baseY = transform.position.y;
            phase = Random.value * Mathf.PI * 2f;
            animator = GetComponentInChildren<Animator>();

            if (!canSpeak) return;

            ring = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            ring.name = "SpeakingRing";
            Destroy(ring.GetComponent<Collider>());
            ring.transform.SetParent(transform, false);
            ring.transform.localPosition = new Vector3(0f, 0.02f, 0f);
            ring.transform.localScale = new Vector3(1.4f, 0.01f, 1.4f);

            // A translucent pool of light rather than a solid white disc at the feet.
            var material = new Material(Shader.Find("Standard"));
            material.SetFloat("_Mode", 3f);
            material.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            material.SetInt("_ZWrite", 0);
            material.DisableKeyword("_ALPHATEST_ON");
            material.EnableKeyword("_ALPHABLEND_ON");
            material.renderQueue = 3000;
            material.color = new Color(ringColour.r, ringColour.g, ringColour.b, 0.3f);
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor", ringColour * 0.8f);
            ring.GetComponent<MeshRenderer>().sharedMaterial = material;
            ring.SetActive(false);
        }

        public void SetSpeaking(bool value)
        {
            if (!canSpeak) return;
            speaking = value;
            if (ring != null) ring.SetActive(value);
            if (animator != null) animator.SetBool("Speaking", value);
        }

        void Update()
        {
            phase += Time.deltaTime * (speaking ? 2.1f : 1.25f);

            if (animator == null)
            {
                var amplitude = speaking ? 0.022f : 0.012f;
                var p = transform.position;
                transform.position = new Vector3(p.x, baseY + Mathf.Sin(phase) * amplitude, p.z);
            }

            if (speaking && ring != null)
            {
                var pulse = 1.4f + Mathf.Sin(phase * 1.3f) * 0.12f;
                ring.transform.localScale = new Vector3(pulse, 0.01f, pulse);
            }
        }
    }
}
