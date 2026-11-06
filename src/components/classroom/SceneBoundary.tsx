import { Component, type ReactNode } from "react";
import { tr } from "@/lib/i18n";

/**
 * True when the browser can create a WebGL context (needed by the 3D classroom).
 *
 * Answered once and remembered. This runs from `render()`, so without the cache every re-render of
 * the page — every keystroke in the ask-a-doubt box — built a canvas and a real WebGL context just
 * to throw it away. That was half of all CPU time while typing, and browsers keep only a handful
 * of live contexts: churning them makes the classroom stutter and can cost it its own context,
 * which is what left the room blank. A browser does not gain or lose WebGL mid-session.
 */
let webglOk: boolean | undefined;
export function webglAvailable(): boolean {
  if (typeof document === "undefined") return true; // server render: do not cache
  if (webglOk !== undefined) return webglOk;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    // hand the probe's context straight back rather than waiting for the collector
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    webglOk = Boolean(gl);
  } catch {
    webglOk = false;
  }
  return webglOk;
}

function Fallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="scene-fallback" role="status">
      <strong>{tr("scene.failedTitle")}</strong>
      <p>{tr("scene.failedBody")}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {tr("scene.retry")}
        </button>
      )}
    </div>
  );
}

/** Keeps a 3D failure from taking the whole classroom page down with it. */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn("3D classroom failed:", error);
  }
  override render() {
    if (this.state.failed) return <Fallback onRetry={() => this.setState({ failed: false })} />;
    if (!webglAvailable()) return <Fallback />;
    return this.props.children;
  }
}
