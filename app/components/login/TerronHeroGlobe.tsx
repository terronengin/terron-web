"use client";

import React, { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const EARTH_RADIUS = 1.58;

type CityNode = {
  id: string;
  lat: number;
  lon: number;
  intensity: number;
};

const CITY_NODES: CityNode[] = [
  { id: "newyork", lat: 40.7128, lon: -74.006, intensity: 1.2 },
  { id: "losangeles", lat: 34.0522, lon: -118.2437, intensity: 0.95 },
  { id: "toronto", lat: 43.6532, lon: -79.3832, intensity: 0.82 },
  { id: "mexico", lat: 19.4326, lon: -99.1332, intensity: 0.84 },
  { id: "saopaulo", lat: -23.5505, lon: -46.6333, intensity: 0.94 },
  { id: "buenosaires", lat: -34.6037, lon: -58.3816, intensity: 0.78 },

  { id: "london", lat: 51.5072, lon: -0.1276, intensity: 1.14 },
  { id: "paris", lat: 48.8566, lon: 2.3522, intensity: 0.88 },
  { id: "berlin", lat: 52.52, lon: 13.405, intensity: 0.84 },
  { id: "madrid", lat: 40.4168, lon: -3.7038, intensity: 0.8 },
  { id: "rome", lat: 41.9028, lon: 12.4964, intensity: 0.78 },

  { id: "istanbul", lat: 41.0082, lon: 28.9784, intensity: 1.26 },
  { id: "ankara", lat: 39.9334, lon: 32.8597, intensity: 0.72 },
  { id: "izmir", lat: 38.4237, lon: 27.1428, intensity: 0.72 },
  { id: "cairo", lat: 30.0444, lon: 31.2357, intensity: 0.82 },
  { id: "dubai", lat: 25.2048, lon: 55.2708, intensity: 1.04 },
  { id: "riyadh", lat: 24.7136, lon: 46.6753, intensity: 0.72 },

  { id: "lagos", lat: 6.5244, lon: 3.3792, intensity: 0.76 },
  { id: "nairobi", lat: -1.2921, lon: 36.8219, intensity: 0.68 },
  { id: "johannesburg", lat: -26.2041, lon: 28.0473, intensity: 0.72 },

  { id: "mumbai", lat: 19.076, lon: 72.8777, intensity: 0.94 },
  { id: "delhi", lat: 28.6139, lon: 77.209, intensity: 0.84 },
  { id: "bangkok", lat: 13.7563, lon: 100.5018, intensity: 0.8 },
  { id: "singapore", lat: 1.3521, lon: 103.8198, intensity: 1.06 },
  { id: "jakarta", lat: -6.2088, lon: 106.8456, intensity: 0.78 },
  { id: "hongkong", lat: 22.3193, lon: 114.1694, intensity: 0.88 },
  { id: "shanghai", lat: 31.2304, lon: 121.4737, intensity: 0.94 },
  { id: "beijing", lat: 39.9042, lon: 116.4074, intensity: 0.82 },
  { id: "seoul", lat: 37.5665, lon: 126.978, intensity: 0.82 },
  { id: "tokyo", lat: 35.6762, lon: 139.6503, intensity: 1.14 },
  { id: "manila", lat: 14.5995, lon: 120.9842, intensity: 0.76 },

  { id: "sydney", lat: -33.8688, lon: 151.2093, intensity: 0.9 },
  { id: "melbourne", lat: -37.8136, lon: 144.9631, intensity: 0.76 },
];

const CONNECTIONS: Array<[string, string, boolean]> = [
  ["newyork", "london", true],
  ["newyork", "istanbul", false],
  ["newyork", "dubai", false],
  ["losangeles", "tokyo", true],
  ["losangeles", "sydney", false],
  ["toronto", "london", false],
  ["mexico", "newyork", false],
  ["saopaulo", "madrid", false],
  ["saopaulo", "lagos", false],
  ["buenosaires", "saopaulo", false],

  ["london", "paris", false],
  ["london", "berlin", false],
  ["london", "madrid", false],
  ["london", "rome", false],
  ["london", "istanbul", true],
  ["paris", "dubai", false],
  ["berlin", "istanbul", false],
  ["rome", "cairo", false],

  ["istanbul", "ankara", false],
  ["istanbul", "izmir", false],
  ["istanbul", "cairo", false],
  ["istanbul", "dubai", true],
  ["istanbul", "riyadh", false],
  ["istanbul", "lagos", false],
  ["istanbul", "mumbai", false],

  ["lagos", "nairobi", false],
  ["nairobi", "johannesburg", false],
  ["cairo", "dubai", false],
  ["dubai", "riyadh", false],
  ["dubai", "mumbai", true],
  ["dubai", "singapore", true],
  ["dubai", "hongkong", false],

  ["mumbai", "delhi", false],
  ["delhi", "bangkok", false],
  ["bangkok", "singapore", true],
  ["singapore", "jakarta", false],
  ["singapore", "hongkong", false],
  ["singapore", "sydney", true],
  ["hongkong", "shanghai", false],
  ["shanghai", "tokyo", true],
  ["beijing", "seoul", false],
  ["seoul", "tokyo", true],
  ["manila", "tokyo", false],

  ["sydney", "melbourne", false],
];

function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

function buildArcPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  lift = 0.32,
  bend = 0
) {
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const normal = new THREE.Vector3().crossVectors(start, end).normalize();

  if (normal.lengthSq() > 0.00001) {
    mid.add(normal.multiplyScalar(bend));
  }

  const midLen = mid.length();
  mid.normalize().multiplyScalar(midLen + lift);

  return new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(90);
}

function NightEarth() {
  const earthNight = useLoader(THREE.TextureLoader, "/textures/earth-night.jpg");
  const earthLights = useLoader(THREE.TextureLoader, "/textures/earth-lights.png");

  useMemo(() => {
    [earthNight, earthLights].forEach((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    });
  }, [earthNight, earthLights]);

  return (
    <>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
        <meshStandardMaterial
          map={earthNight}
          roughness={1}
          metalness={0}
          color="#bfc7d1"
        />
      </mesh>

      <mesh scale={[1.0015, 1.0015, 1.0015]}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
        <meshBasicMaterial
          map={earthLights}
          color="#ffd98a"
          transparent
          opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

function SceneContent() {
  const globeGroup = useRef<THREE.Group>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const flowRefs = useRef<Array<THREE.Mesh | null>>([]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, { pos: THREE.Vector3; intensity: number }>();
    CITY_NODES.forEach((node) => {
      map.set(node.id, {
        pos: latLonToVector3(node.lat, node.lon, EARTH_RADIUS + 0.02),
        intensity: node.intensity,
      });
    });
    return map;
  }, []);

  const arcData = useMemo(() => {
    return CONNECTIONS.map(([from, to, strong], index) => {
      const start = nodeMap.get(from)?.pos;
      const end = nodeMap.get(to)?.pos;
      if (!start || !end) return null;

      const bend = ((index % 5) - 2) * 0.028;
      const lift = strong ? 0.42 : 0.3 + (index % 3) * 0.03;
      const points = buildArcPoints(start, end, lift, bend);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);

      return {
        id: `${from}-${to}-${index}`,
        points,
        geometry,
        strong,
        flowCount: strong ? 4 : 2 + (index % 2),
        speed: strong ? 0.18 : 0.12 + (index % 4) * 0.014,
      };
    }).filter(Boolean) as Array<{
      id: string;
      points: THREE.Vector3[];
      geometry: THREE.BufferGeometry;
      strong: boolean;
      flowCount: number;
      speed: number;
    }>;
  }, [nodeMap]);

  const flowMeta = useMemo(() => {
    const items: Array<{ arcIndex: number; offset: number; speedMul: number; seed: number }> = [];
    arcData.forEach((arc, arcIndex) => {
      for (let i = 0; i < arc.flowCount; i++) {
        items.push({
          arcIndex,
          offset: i / arc.flowCount,
          speedMul: 0.9 + i * 0.16,
          seed: arcIndex * 0.31 + i * 0.17,
        });
      }
    });
    return items;
  }, [arcData]);

  const galaxyHaze = useMemo(() => {
    const arr: Array<{
      pos: [number, number, number];
      scale: [number, number, number];
      opacity: number;
      color: string;
      rot: [number, number, number];
    }> = [];

    for (let i = 0; i < 16; i++) {
      arr.push({
        pos: [
          -4.6 + Math.random() * 9.2,
          0.5 + Math.random() * 4.5,
          -5 - Math.random() * 5,
        ],
        scale: [1.4 + Math.random() * 2.7, 0.5 + Math.random() * 1.1, 1],
        opacity: 0.018 + Math.random() * 0.03,
        color: Math.random() > 0.72 ? "#8aa7ff" : "#ffe4b0",
        rot: [0, 0, -0.45 + Math.random() * 0.9],
      });
    }

    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    if (globeGroup.current) {
      globeGroup.current.rotation.x = 0.2 + Math.sin(t * 0.08) * 0.008;
    }

    if (controlsRef.current) {
      controlsRef.current.autoRotate = true;
      controlsRef.current.autoRotateSpeed = 0.22;
    }

    flowRefs.current.forEach((mesh, i) => {
      const meta = flowMeta[i];
      if (!mesh || !meta) return;

      const arc = arcData[meta.arcIndex];
      if (!arc) return;

      const offset = (t * arc.speed * meta.speedMul + meta.offset + meta.seed) % 1;
      const idx = Math.min(arc.points.length - 1, Math.floor(offset * (arc.points.length - 1)));
      mesh.position.copy(arc.points[idx]);

      const pulse = 1 + Math.sin(t * 7 + i * 0.4) * 0.16;
      const base = arc.strong ? 1.35 : 1.05;
      mesh.scale.setScalar(base * pulse);
    });
  });

  return (
    <>
      <color attach="background" args={["#01040a"]} />
      <fog attach="fog" args={["#01040a", 8.5, 15]} />

      <PerspectiveCamera makeDefault position={[0, 0.3, 7.7]} fov={35} />

      <Stars radius={180} depth={95} count={7000} factor={4.5} saturation={0} fade speed={0.24} />

      {galaxyHaze.map((g, i) => (
        <mesh key={`haze-${i}`} position={g.pos} rotation={g.rot}>
          <planeGeometry args={[g.scale[0], g.scale[1]]} />
          <meshBasicMaterial
            color={g.color}
            transparent
            opacity={g.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}

      <group position={[0, 0.22, 0]} ref={globeGroup}>
        <ambientLight intensity={0.2} />
        <directionalLight position={[4.8, 2.8, 4.6]} intensity={0.26} color="#9ab6ff" />
        <pointLight position={[0, 0.7, 3.6]} intensity={0.12} color="#b4c8ff" />

        <mesh position={[0, -2.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[4.15, 72]} />
          <meshBasicMaterial color="#7b8ca4" transparent opacity={0.022} />
        </mesh>

        <NightEarth />

        {CITY_NODES.map((node) => {
          const entry = nodeMap.get(node.id);
          const pos = entry?.pos ?? new THREE.Vector3();
          const intensity = entry?.intensity ?? 1;

          return (
            <group key={node.id} position={pos}>
              <mesh>
                <sphereGeometry args={[0.013 * intensity, 10, 10]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              <mesh>
                <sphereGeometry args={[0.038 * intensity, 10, 10]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.15} />
              </mesh>
            </group>
          );
        })}

        {arcData.map((arc) => (
          <line key={arc.id}>
            <primitive object={arc.geometry} attach="geometry" />
            <lineBasicMaterial
              attach="material"
              color="#dbe6ff"
              transparent
              opacity={arc.strong ? 0.06 : 0.035}
            />
          </line>
        ))}

        {flowMeta.map((meta, i) => {
          const strong = arcData[meta.arcIndex]?.strong;
          return (
            <mesh
              key={`flow-${i}`}
              ref={(el) => {
                flowRefs.current[i] = el;
              }}
            >
              <sphereGeometry args={[strong ? 0.018 : 0.014, 10, 10]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          );
        })}
      </group>

      <OrbitControls
        ref={controlsRef}
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.48}
        minPolarAngle={Math.PI / 2.22}
        maxPolarAngle={Math.PI / 1.94}
      />
    </>
  );
}

export default function TerronHeroGlobe() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 450,
        borderRadius: 28,
        overflow: "hidden",
        background: `
          radial-gradient(circle at 50% 12%, rgba(140,165,255,0.06), transparent 18%),
          radial-gradient(circle at 18% 14%, rgba(70,95,180,0.1), transparent 22%),
          radial-gradient(circle at 78% 20%, rgba(255,228,170,0.04), transparent 18%),
          linear-gradient(180deg, #020812 0%, #01040a 100%)
        `,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(circle at 22% 16%, rgba(255,255,255,0.04), transparent 11%),
            radial-gradient(circle at 70% 14%, rgba(140,165,255,0.05), transparent 16%),
            radial-gradient(circle at 50% 54%, rgba(255,255,255,0.02), transparent 28%)
          `,
          zIndex: 1,
        }}
      />

      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} style={{ position: "absolute", inset: 0 }}>
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>

      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        <MiniPill label="AĞ DURUMU" value="GLOBAL" />
        <MiniPill label="TERRON GLOBAL NETWORK" value="" center />
        <MiniPill label="İŞLEM AKIŞI" value="CANLI" />
      </div>

      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 2,
          padding: "8px 15px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          color: "#f1dfb5",
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: 1,
          boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
          pointerEvents: "none",
        }}
      >
        TERRONTR.COM
      </div>
    </div>
  );
}

function MiniPill({
  label,
  value,
  center = false,
}: {
  label: string;
  value: string;
  center?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: center ? 196 : 94,
        padding: center ? "9px 14px" : "9px 12px",
        borderRadius: 15,
        background: "rgba(6,12,22,0.72)",
        border: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(10px)",
        textAlign: "center",
        boxShadow: "0 10px 22px rgba(0,0,0,0.14)",
      }}
    >
      {center ? (
        <div
          style={{
            color: "#f0d28a",
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: 1.05,
          }}
        >
          {label}
        </div>
      ) : (
        <>
          <div
            style={{
              color: "#aebad0",
              fontSize: 9.2,
              fontWeight: 800,
              letterSpacing: 0.72,
              marginBottom: 2,
            }}
          >
            {label}
          </div>
          <div
            style={{
              color: "#ffffff",
              fontSize: 12.6,
              fontWeight: 900,
              letterSpacing: 0.2,
            }}
          >
            {value}
          </div>
        </>
      )}
    </div>
  );
}