import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox, Text, useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

type Speaker = "teacher" | "maya" | "arjun";
const C = { wall: "#d8d1bf", floor: "#805d3d", wood: "#a8784f", dark: "#253039", board: "#183e35", chalk: "#f5f2e8", teacher: "#2f6f71", maya: "#d06a52", arjun: "#d7a83e", skin: "#b97a55", metal: "#536874", window: "#a9d9df" };


const A = "CharacterArmature|";
function Avatar({ url, position, rotation = 0, scale = 1, speaking, faceTo }: { url: string; position: [number, number, number]; rotation?: number; scale?: number; speaking: boolean; faceTo?: [number, number] }) {
  const { scene, animations } = useGLTF(url);
  const model = useMemo(() => { const c = cloneSkinned(scene); c.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return c; }, [scene]);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  useEffect(() => {
    const idle = actions[A + "Idle_Neutral"] ?? actions[A + "Idle"];
    if (!speaking) { idle?.reset().fadeIn(.4).play(); return () => { idle?.fadeOut(.4); }; }
    const seq = [A + "Interact", A + "Idle", A + "Wave"]; let i = 0; let cur = actions[seq[0]!];
    cur?.reset().fadeIn(.35).play();
    const t = window.setInterval(() => { const next = actions[seq[++i % seq.length]!]; if (next && next !== cur) { cur?.fadeOut(.4); next.reset().fadeIn(.4).play(); cur = next; } }, 2600);
    return () => { window.clearInterval(t); cur?.fadeOut(.4); };
  }, [speaking, actions]);
  const rotY = faceTo ? Math.atan2(faceTo[0] - position[0], faceTo[1] - position[2]) : rotation;
  return <group ref={group} position={position} rotation-y={rotY} scale={scale}><primitive object={model} /></group>;
}
["/models/teacher.glb", "/models/maya.glb", "/models/arjun.glb"].forEach(u => useGLTF.preload(u));

function Desk({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
 return <group position={position} rotation-y={rotation}><RoundedBox args={[1.8,.16,.75]} radius={.05} position={[0,.85,0]} castShadow><meshStandardMaterial color={C.wood} roughness={.75}/></RoundedBox>{[-.72,.72].flatMap(x=>[-.25,.25].map((z,i)=><mesh key={`${x}-${i}`} position={[x,.4,z]} castShadow><boxGeometry args={[.1,.8,.1]}/><meshStandardMaterial color={C.metal}/></mesh>))}</group>
}

function CameraRig({ speaker }: { speaker: Speaker }) {
 const { camera } = useThree();
 useFrame((_, delta) => {
  const target = speaker === "teacher" ? new THREE.Vector3(0,3.1,8.8) : speaker === "maya" ? new THREE.Vector3(-1.2,2.3,-1.9) : new THREE.Vector3(1.2,2.3,-1.9);
  camera.position.lerp(target, 1-Math.exp(-1.5*Math.min(delta,.05)));
  const lookAt = speaker === "teacher"
   ? new THREE.Vector3(0, 2.2, -2)
   : speaker === "maya"
     ? new THREE.Vector3(-2.8, 1.45, .55)
     : new THREE.Vector3(2.8, 1.45, .55);
  camera.lookAt(lookAt);
 });
 return null;
}

function Room({ speaker, board }: { speaker: Speaker; board: string }) {
 return <>
  <CameraRig speaker={speaker}/><color attach="background" args={[C.wall]}/><fog attach="fog" args={[C.wall,14,30]}/>
  <ambientLight intensity={.65}/><directionalLight position={[5,10,7]} intensity={1.6} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}/>
  <Environment><Lightformer intensity={2} position={[0,7,0]} scale={[12,12,1]}/><Lightformer intensity={1} color={C.window} position={[-7,4,0]} rotation-y={Math.PI/2} scale={[7,4,1]}/></Environment>
  <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[18,20]}/><meshStandardMaterial color={C.floor} roughness={.95}/></mesh>
  <mesh position={[0,4,-5]} receiveShadow><boxGeometry args={[18,8,.2]}/><meshStandardMaterial color={C.wall}/></mesh>
  <mesh position={[-6.1,3.9,-4.75]}><boxGeometry args={[2.35,3.7,.12]}/><meshStandardMaterial color={C.window} emissive={C.window} emissiveIntensity={.18}/></mesh>
  <mesh position={[-6.1,3.9,-4.58]}><boxGeometry args={[.08,3.7,.05]}/><meshStandardMaterial color={C.dark}/></mesh>
  <mesh position={[-6.1,3.9,-4.58]}><boxGeometry args={[2.35,.08,.05]}/><meshStandardMaterial color={C.dark}/></mesh>
  <mesh position={[6.2,2.1,-4.68]}><boxGeometry args={[1.25,2.6,.16]}/><meshStandardMaterial color={C.wood}/></mesh>
  <mesh position={[6.2,2.1,-4.52]}><boxGeometry args={[1.03,2.25,.04]}/><meshStandardMaterial color={C.dark}/></mesh>
  <RoundedBox args={[8,3.2,.18]} radius={.06} position={[0,3.6,-4.78]} castShadow><meshStandardMaterial color={C.board} roughness={.85}/></RoundedBox>
  <Text position={[0,3.7,-4.65]} fontSize={.34} maxWidth={6.8} textAlign="center" anchorX="center" anchorY="middle" color={C.chalk}>{board}</Text>
  <Avatar url="/models/teacher.glb" position={[0,0,-3.2]} speaking={speaker==="teacher"} faceTo={[0,6]}/>
  <Desk position={[-2.8,0,-.2]} rotation={-.06}/><Avatar url="/models/maya.glb" position={[-2.8,0,.55]} scale={.92} speaking={speaker==="maya"} faceTo={[0,-3.2]}/>
  <Desk position={[2.8,0,-.2]} rotation={.06}/><Avatar url="/models/arjun.glb" position={[2.8,0,.55]} scale={.95} speaking={speaker==="arjun"} faceTo={[0,-3.2]}/>
  <Desk position={[-2.7,0,3.1]}/><Avatar url="/models/arjun.glb" position={[-2.7,0,3.85]} scale={.9} speaking={false} faceTo={[0,-3.2]}/>
  <Desk position={[2.7,0,3.1]}/><Avatar url="/models/maya.glb" position={[2.7,0,3.85]} scale={.9} speaking={false} faceTo={[0,-3.2]}/>
  <Desk position={[0,0,5.2]}/>
  <group position={[-6.4,0,-2.7]}><mesh position={[0,.55,0]}><cylinderGeometry args={[.46,.34,1,16]}/><meshStandardMaterial color={C.dark}/></mesh><mesh position={[0,1.45,0]}><sphereGeometry args={[.65,16,12]}/><meshStandardMaterial color="#487963" roughness={.9}/></mesh></group>
 </>;
}

export function ClassroomScene({ speaker, board }: { speaker: Speaker; board: string }) {
 return <Canvas shadows dpr={[1,1.5]} camera={{ position:[0,3.1,8.8], fov:48 }} gl={{ antialias:true }}><Suspense fallback={null}><Room speaker={speaker} board={board}/></Suspense></Canvas>;
}
