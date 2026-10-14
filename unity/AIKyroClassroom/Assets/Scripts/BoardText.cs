using System.Text;
using UnityEngine;

namespace AIKyro
{
    /// TextMesh has no word wrap and no way to fit text to a box, so long board
    /// lines used to run off the chalkboard. This wraps at a sensible width and
    /// then scales the whole mesh down until it fits inside the board surface.
    [RequireComponent(typeof(TextMesh))]
    public class BoardText : MonoBehaviour
    {
        public float maxWidth = 7.2f;
        public float maxHeight = 2.5f;
        public int wrapChars = 22;

        TextMesh mesh;
        Renderer meshRenderer;
        bool dirty;

        void Awake()
        {
            mesh = GetComponent<TextMesh>();
            meshRenderer = GetComponent<Renderer>();
        }

        public void SetText(string value)
        {
            if (mesh == null) Awake();
            mesh.text = Wrap(string.IsNullOrWhiteSpace(value) ? "AI KYRO" : value.Trim(), wrapChars);
            transform.localScale = Vector3.one;
            dirty = true;
        }

        void LateUpdate()
        {
            if (!dirty || meshRenderer == null) return;
            dirty = false;

            var size = meshRenderer.bounds.size;
            if (size.x <= 0.001f || size.y <= 0.001f) return;

            var fit = Mathf.Min(maxWidth / size.x, maxHeight / size.y, 1f);
            transform.localScale = Vector3.one * fit;
        }

        static string Wrap(string value, int width)
        {
            var words = value.Split(' ');
            var builder = new StringBuilder();
            var lineLength = 0;

            foreach (var word in words)
            {
                if (lineLength > 0 && lineLength + 1 + word.Length > width)
                {
                    builder.Append('\n');
                    lineLength = 0;
                }
                else if (lineLength > 0)
                {
                    builder.Append(' ');
                    lineLength++;
                }

                builder.Append(word);
                lineLength += word.Length;
            }

            return builder.ToString();
        }
    }
}
