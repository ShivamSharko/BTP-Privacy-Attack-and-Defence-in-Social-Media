import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Color, Fog } from "three";
import type { Registry } from "../deck/registry";
import { useDeck } from "../deck/store";
import type { TheoryDef } from "../deck/types";
import { SURFACE_HEX } from "../styles/roles";
import { CameraRig, type Travel } from "./CameraRig";
import { LabelLayer, LabelProjector } from "./kit/labels";
import { stationOrigin, worldPose } from "./stations";

/** A scene that throws must not take the deck down with it. */
class SceneBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(`[deck] scene "${this.props.name}" failed:`, error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Atmosphere() {
  const theme = useDeck((s) => s.theme);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    // Fog in the background colour hides the neighbouring stations until the camera flies to them.
    scene.fog = new Fog(new Color(SURFACE_HEX[theme].dusk), 34, 90);
    invalidate();
    return () => {
      scene.fog = null;
    };
  }, [scene, theme, invalidate]);
  return (
    <>
      <ambientLight intensity={theme === "dark" ? 0.75 : 1.1} />
      <directionalLight position={[6, 10, 8]} intensity={1.7} />
      <directionalLight position={[-8, 4, -6]} intensity={0.5} color="#b9a8ff" />
    </>
  );
}

/** With ?perf=1 the last 240 frame times are kept on window.__perf for the frame-time check. */
function PerfProbe() {
  const samples = useRef<number[]>([]);
  useEffect(() => {
    (window as unknown as { __perf: { samples: number[] } }).__perf = { samples: samples.current };
  }, []);
  useFrame((_, delta) => {
    const list = samples.current;
    list.push(delta * 1000);
    if (list.length > 240) list.shift();
  });
  return null;
}

function Station({ theory, step, active }: { theory: TheoryDef; step: number; active: boolean }) {
  const origin = useMemo(() => stationOrigin(theory.number), [theory.number]);
  const Scene = theory.Scene;
  return (
    <group position={origin}>
      <SceneBoundary name={theory.id}>
        <Suspense fallback={null}>
          <Scene step={step} active={active} />
        </Suspense>
      </SceneBoundary>
    </group>
  );
}

export function World({ registry }: { registry: Registry }) {
  const index = useDeck((s) => s.index);
  const reducedMotion = useDeck((s) => s.reducedMotion);
  const setWebgl = useDeck((s) => s.setWebgl);
  const flat = registry.slides[index];
  const position = registry.theories.indexOf(flat.theory);

  // Keep the station we just left mounted until the flight away from it is over.
  const [leaving, setLeaving] = useState<number | null>(null);
  const last = useRef({ position, index });
  const travel = useRef<Travel>("cut");
  if (last.current.index !== index) {
    travel.current = reducedMotion ? "cut" : last.current.position === position ? "step" : "fly";
  }
  useEffect(() => {
    const previous = last.current.position;
    last.current = { position, index };
    if (previous === position) return;
    setLeaving(previous);
    const timer = window.setTimeout(() => setLeaving(null), 1400);
    return () => window.clearTimeout(timer);
  }, [position, index]);

  const solo = typeof window !== "undefined" && window.location.href.includes("solo=1");
  const mounted = new Set(solo ? [position] : [position - 1, position, position + 1]);
  if (leaving !== null && !solo) mounted.add(leaving);

  const pose = worldPose(flat.theory.number, flat.slide.pose);
  const stage = flat.slide.layout === "stage";
  const perf = typeof window !== "undefined" && window.location.href.includes("perf=1");

  return (
    <>
    <Canvas
      flat
      dpr={[1, 1.75]}
      frameloop={stage ? "demand" : "always"}
      camera={{ fov: 40, near: 0.1, far: 260, position: pose.position }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener("webglcontextlost", () => setWebgl(false));
      }}
    >
      <Atmosphere />
      <CameraRig pose={pose} travel={travel.current} />
      <LabelProjector />
      {perf ? <PerfProbe /> : null}
      {registry.theories.map((theory, i) => {
        if (!mounted.has(i)) return null;
        const slides = theory.slides;
        const step = i === position ? flat.slide.step : i < position ? slides[slides.length - 1].step : slides[0].step;
        return <Station key={theory.id} theory={theory} step={step} active={i === position} />;
      })}
    </Canvas>
    <LabelLayer />
    </>
  );
}
