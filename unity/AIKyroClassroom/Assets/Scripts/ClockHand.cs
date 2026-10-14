using UnityEngine;

namespace AIKyro
{
    public class ClockHand : MonoBehaviour
    {
        public Transform hand;

        void Update()
        {
            if (hand != null) hand.Rotate(Vector3.forward, -12f * Time.deltaTime, Space.Self);
        }
    }
}
