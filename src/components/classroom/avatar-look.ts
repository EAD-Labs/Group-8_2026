import * as THREE from "three";
import type { Accessory, Look } from "./personas";

const matches = (name: string, target: string) => name === target || name.startsWith(target + "_");

/**
 * Recolour a cloned avatar and hide meshes according to `look`.
 * SkeletonUtils.clone shares materials between clones, so every material is cloned first —
 * otherwise recolouring one avatar would recolour every instance of the same model.
 */
export function applyLookMaterials(model: THREE.Object3D, look: Look): void {
  const hide = look.hide ?? [];
  model.traverse((o) => {
    if (hide.some((h) => matches(o.name, h))) o.visible = false;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const recolor = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      const hex = look.colors[m.name];
      const std = c as THREE.MeshStandardMaterial;
      if (hex && std.color) std.color.set(hex);
      return c;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(recolor)
      : recolor(mesh.material);
  });
}

const std = (color: string, metalness = 0.1, roughness = 0.5) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

function segment(a: THREE.Vector3, b: THREE.Vector3, thickness: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(thickness, len, thickness), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** Round glasses, authored in model space (metres) with the origin at the bridge of the nose. */
export function buildGlasses(frame: string): THREE.Group {
  const g = new THREE.Group();
  const mat = std(frame, frame === "#c9a24b" ? 0.8 : 0.2, 0.35);
  for (const x of [-0.036, 0.036]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0035, 8, 24), mat);
    ring.position.set(x, 0, 0);
    g.add(ring);
    const temple = segment(
      new THREE.Vector3(x * 1.95, 0, -0.002),
      new THREE.Vector3(x * 2.75, 0, -0.15),
      0.006,
      mat,
    );
    g.add(temple);
  }
  g.add(
    segment(new THREE.Vector3(-0.006, 0.004, 0), new THREE.Vector3(0.006, 0.004, 0), 0.005, mat),
  );
  return g;
}

/** Lanyard with an ID card, authored in model space with the origin at the card centre. */
export function buildBadge(): THREE.Group {
  const g = new THREE.Group();
  const strap = std("#b13a3a", 0.0, 0.7);
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.006), std("#f4f4f2", 0.0, 0.6));
  g.add(card);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.022, 0.0068),
    std("#2f6f71", 0, 0.6),
  );
  stripe.position.set(0, 0.036, 0);
  g.add(stripe);
  // strap goes up and around the neck (neck sits ~0.30 m above the card, slightly behind it)
  g.add(
    segment(
      new THREE.Vector3(-0.012, 0.05, 0),
      new THREE.Vector3(-0.07, 0.22, -0.11),
      0.007,
      strap,
    ),
  );
  g.add(
    segment(new THREE.Vector3(0.012, 0.05, 0), new THREE.Vector3(0.07, 0.22, -0.11), 0.007, strap),
  );
  return g;
}

/**
 * Parent `obj` to a bone while keeping it at `worldPos` (model space, rest pose) with no rotation
 * or scale. The armature is scaled 100x, so a plain `bone.add(obj)` would be 100x too big.
 */
export function attachToBone(
  model: THREE.Object3D,
  boneName: string,
  obj: THREE.Object3D,
  worldPos: [number, number, number],
): boolean {
  const bone = model.getObjectByName(boneName);
  if (!bone) return false;
  model.updateMatrixWorld(true);
  const holder = new THREE.Group();
  holder.name = `${boneName}-attachment`;
  const p = new THREE.Vector3(...worldPos);
  bone.worldToLocal(p);
  holder.position.copy(p);
  const q = new THREE.Quaternion();
  bone.getWorldQuaternion(q);
  holder.quaternion.copy(q.invert());
  const s = new THREE.Vector3();
  bone.getWorldScale(s);
  holder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
  holder.add(obj);
  bone.add(holder);
  return true;
}

/** Rest-pose anchor points (metres, model space) shared by all three rigs. */
export const ANCHORS = {
  glasses: [0.0, 1.697, 0.182] as [number, number, number],
  badge: [0.0, 1.22, 0.2] as [number, number, number],
};

export function addAccessories(model: THREE.Object3D, accessories: Accessory[] = []): void {
  for (const a of accessories) {
    if (a === "glasses-dark") attachToBone(model, "Head", buildGlasses("#1b1b1f"), ANCHORS.glasses);
    else if (a === "glasses-gold")
      attachToBone(model, "Head", buildGlasses("#c9a24b"), ANCHORS.glasses);
    else if (a === "badge") attachToBone(model, "Chest", buildBadge(), ANCHORS.badge);
  }
}

// ------------------------------------------------------------------ seated pose
// The character pack has no sitting animation. Its rig is unusual (legs hang off `Body`, feet are
// separate bones under `Root`), so a naive bone rotation tears the mesh apart. Instead the seated
// pose is computed from the rig's own rest pose: lower the pelvis onto a seat, swing each thigh
// forward 90°, keep each shin vertical, and carry each foot with the knee.

const SEAT_HEIGHT = 0.5; // pelvis height above the floor when seated (metres)

/**
 * Build a looping "seated idle" clip from a standing idle clip. Upper-body tracks (head, torso,
 * arms) are kept so the person still breathes and looks around; pelvis/legs/feet are replaced.
 * Call on a freshly cloned model that is still in its rest pose.
 */
export function makeSeatedClip(
  model: THREE.Object3D,
  idle: THREE.AnimationClip,
): THREE.AnimationClip | null {
  const get = (n: string) => model.getObjectByName(n);
  const body = get("Body");
  const root = get("Root");
  const legs = (["L", "R"] as const).map((s) => ({
    up: get(`UpperLeg${s}`),
    low: get(`LowerLeg${s}`),
    foot: get(`Foot${s}`),
    s,
  }));
  if (!body || !root || legs.some((l) => !l.up || !l.low || !l.foot)) return null;
  model.updateMatrixWorld(true);

  const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  const drop = new THREE.Vector3(0, -(wp(body).y - SEAT_HEIGHT), 0);
  const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // thigh: down -> forward

  const tracks: THREE.KeyframeTrack[] = idle.tracks
    .filter((t) => !/^(UpperLeg|LowerLeg|Foot|Toes)/.test(t.name))
    .map((t) => t.clone());

  // pelvis: keep the idle bob, but lower it onto the seat
  const bodyParent = body.parent as THREE.Object3D;
  const restLocal = body.position.clone();
  const dropLocal = bodyParent
    .worldToLocal(wp(body).add(drop))
    .sub(bodyParent.worldToLocal(wp(body)));
  const bp = tracks.find((t) => t.name === "Body.position");
  if (bp) {
    const v = bp.values as unknown as Float32Array;
    for (let i = 0; i < v.length; i += 3) {
      v[i] = (v[i] ?? 0) + dropLocal.x;
      v[i + 1] = (v[i + 1] ?? 0) + dropLocal.y;
      v[i + 2] = (v[i + 2] ?? 0) + dropLocal.z;
    }
  } else
    tracks.push(
      new THREE.VectorKeyframeTrack("Body.position", [0], restLocal.add(dropLocal).toArray()),
    );

  const bodyWorldQ = wq(body);
  for (const { up, low, foot, s } of legs) {
    if (!up || !low || !foot) continue;
    const hip = wp(up);
    const knee = wp(low);
    const ankle = wp(foot);
    const upRestQ = wq(up);
    const lowRestQ = wq(low);
    // thigh: world rotation = swing * rest; expressed relative to the pelvis
    const upNewQ = swing.clone().multiply(upRestQ);
    const upLocalQ = bodyWorldQ.clone().invert().multiply(upNewQ);
    // shin stays vertical (same world orientation as standing), relative to the new thigh
    const lowLocalQ = upNewQ.clone().invert().multiply(lowRestQ);
    // foot follows the knee: new knee = hip' + swing*(knee - hip), ankle keeps its offset from the knee
    const hipNew = hip.clone().add(drop);
    const kneeNew = hipNew.clone().add(knee.clone().sub(hip).applyQuaternion(swing));
    const ankleNew = kneeNew.clone().add(ankle.clone().sub(knee));
    ankleNew.y = Math.max(ankleNew.y, ankle.y); // never sink into the floor
    const footLocal = (foot.parent as THREE.Object3D).worldToLocal(ankleNew);
    tracks.push(
      new THREE.QuaternionKeyframeTrack(`UpperLeg${s}.quaternion`, [0], upLocalQ.toArray()),
      new THREE.QuaternionKeyframeTrack(`LowerLeg${s}.quaternion`, [0], lowLocalQ.toArray()),
      new THREE.VectorKeyframeTrack(`Foot${s}.position`, [0], footLocal.toArray()),
    );
  }
  return new THREE.AnimationClip("Seated_Idle", idle.duration, tracks);
}
