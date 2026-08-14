"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Vector3, Vector2, Plane, Raycaster, type OrthographicCamera as ThreeOrthographicCamera } from "three";
import { getIcon } from "@/lib/icon-map";
import { getFurnitureRecipe } from "@/lib/three/furniture-recipes";
import { placeFurniture, ROOM_WIDTH, ROOM_DEPTH } from "@/lib/three/layout";
import { roomFloorColor } from "@/lib/three/room-colors";
import { updateFurniturePlacement } from "@/lib/actions/furniture";
import { setCachedFurniturePlacement } from "@/lib/three/furniture-position-cache";
import type { Furniture, Room } from "@/lib/supabase/types";

// react-three-fiber's Canvas renders its children through a separate React
// reconciler (not react-dom), which breaks Next.js's server-action/transition
// plumbing if called from inside it. So navigation and persistence both live
// in the plain react-dom wrapper below and are threaded into the scene as
// callback props — nothing inside <Canvas> calls useRouter/useTransition or
// a "use server" action directly.

export interface RoomTopViewProps {
  room: Room;
  furniture: Furniture[];
  itemCountByFurniture: Record<string, number>;
  className?: string;
}

interface Placement {
  x: number;
  z: number;
  rotationY: number;
}

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const MARGIN_X = ROOM_WIDTH / 2 - 0.3;
const MARGIN_Z = ROOM_DEPTH / 2 - 0.3;
const DRAG_THRESHOLD_M = 0.05;

/** Straight-down orthographic camera, framed so the whole room fits regardless of the canvas aspect ratio. */
function TopDownCamera() {
  const { size, camera } = useThree();

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const halfDepth = (Math.max(ROOM_DEPTH, ROOM_WIDTH / aspect) / 2) * 1.15;
    const halfWidth = halfDepth * aspect;
    // Mutating the camera object in place is the standard r3f pattern for
    // driving a Three.js camera (matching how drei's own camera helpers work).
    /* eslint-disable react-hooks/immutability */
    const cam = camera as ThreeOrthographicCamera;
    cam.left = -halfWidth;
    cam.right = halfWidth;
    cam.top = halfDepth;
    cam.bottom = -halfDepth;
    cam.near = 0.1;
    cam.far = 50;
    cam.position.set(0, 12, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    /* eslint-enable react-hooks/immutability */
  }, [size, camera]);

  return null;
}

function FurnitureBox({
  furniture,
  placement,
  itemCount,
  onDragStart,
  onRotate,
}: {
  furniture: Furniture;
  placement: Placement;
  itemCount: number;
  onDragStart: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onRotate: (id: string) => void;
}) {
  const recipe = getFurnitureRecipe(furniture.type);
  const Icon = getIcon(furniture.icon);
  const [hovered, setHovered] = useState(false);
  const topY = useMemo(
    () => Math.max(0.4, ...recipe.parts.map((p) => p.position[1] + p.size[1] / 2)),
    [recipe]
  );

  return (
    <group position={[placement.x, 0, placement.z]}>
      <group
        rotation={[0, (placement.rotationY * Math.PI) / 180, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragStart(furniture.id, e);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
        scale={hovered ? 1.05 : 1}
      >
        {recipe.parts.map((part, i) => (
          <mesh key={i} position={part.position} castShadow receiveShadow>
            <boxGeometry args={part.size} />
            <meshStandardMaterial color={part.color} roughness={part.roughness ?? 0.6} metalness={part.metalness ?? 0.05} />
          </mesh>
        ))}
      </group>

      <Html position={[0, topY + 0.2, 0]} center occlude={false} style={{ pointerEvents: "none" }}>
        <div className="pointer-events-none whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-[#0b0b14] shadow">
          <span className="inline-flex items-center gap-1">
            <Icon className="size-3" />
            {furniture.name}
          </span>
        </div>
      </Html>

      {itemCount > 0 && (
        <Html position={[-0.55, topY, 0.5]} center occlude={false} style={{ pointerEvents: "none" }}>
          <span className="pointer-events-none flex size-4 items-center justify-center rounded-full bg-[#0b0b14] text-[9px] font-bold text-white">
            {itemCount}
          </span>
        </Html>
      )}

      <Html position={[0.55, topY, 0.5]} center occlude={false}>
        <button
          type="button"
          aria-label={`Rotate ${furniture.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRotate(furniture.id);
          }}
          className="flex size-5 cursor-pointer items-center justify-center rounded-full bg-white text-[#0b0b14] shadow ring-1 ring-[#0b0b14]/10 hover:bg-white/90"
        >
          <RotateCw className="size-3" />
        </button>
      </Html>
    </group>
  );
}

function SceneContents({
  room,
  furniture,
  itemCountByFurniture,
  onPersist,
  onOpenFurniture,
}: Omit<RoomTopViewProps, "className"> & {
  onPersist: (id: string, placement: Placement) => void;
  onOpenFurniture: (id: string) => void;
}) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

  const [placements, setPlacements] = useState<Record<string, Placement>>(() => {
    const placed = placeFurniture(furniture, ROOM_WIDTH, ROOM_DEPTH);
    return Object.fromEntries(placed.map((p) => [p.furniture.id, { x: p.x, z: p.z, rotationY: p.rotationY }]));
  });
  const placementsRef = useRef(placements);
  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  function screenToGround(clientX: number, clientY: number): Vector3 | null {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const point = new Vector3();
    return raycaster.ray.intersectPlane(GROUND_PLANE, point) ? point : null;
  }

  function onDragStart(id: string, e: ThreeEvent<PointerEvent>) {
    const start = screenToGround(e.nativeEvent.clientX, e.nativeEvent.clientY);
    const current = placementsRef.current[id];
    if (!start || !current) return;

    const drag = { startX: current.x, startZ: current.z, startPoint: start, moved: false };

    function handleMove(ev: PointerEvent) {
      const p = screenToGround(ev.clientX, ev.clientY);
      if (!p) return;
      const dx = p.x - drag.startPoint.x;
      const dz = p.z - drag.startPoint.z;
      if (!drag.moved && (Math.abs(dx) > DRAG_THRESHOLD_M || Math.abs(dz) > DRAG_THRESHOLD_M)) {
        drag.moved = true;
      }
      const nextX = Math.max(-MARGIN_X, Math.min(MARGIN_X, drag.startX + dx));
      const nextZ = Math.max(-MARGIN_Z, Math.min(MARGIN_Z, drag.startZ + dz));
      setPlacements((prev) => ({ ...prev, [id]: { ...prev[id], x: nextX, z: nextZ } }));
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "default";
      if (!drag.moved) {
        onOpenFurniture(id);
        return;
      }
      const placement = placementsRef.current[id];
      if (placement) {
        setCachedFurniturePlacement(id, placement.x, placement.z, placement.rotationY);
        onPersist(id, placement);
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function onRotate(id: string) {
    const current = placementsRef.current[id];
    if (!current) return;
    const next = { ...current, rotationY: (current.rotationY + 90) % 360 };
    setPlacements((prev) => ({ ...prev, [id]: next }));
    setCachedFurniturePlacement(id, next.x, next.z, next.rotationY);
    onPersist(id, next);
  }

  return (
    <>
      <TopDownCamera />
      <hemisphereLight color="#f5f2ea" groundColor="#c9baa3" intensity={0.7} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[2, 10, 3]} intensity={0.55} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial color={roomFloorColor(room.type)} roughness={0.9} />
      </mesh>

      {furniture.map((f) => (
        <FurnitureBox
          key={f.id}
          furniture={f}
          placement={placements[f.id] ?? { x: 0, z: 0, rotationY: 0 }}
          itemCount={itemCountByFurniture[f.id] ?? 0}
          onDragStart={onDragStart}
          onRotate={onRotate}
        />
      ))}
    </>
  );
}

export default function RoomTopViewScene(props: RoomTopViewProps): ReactNode {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function onPersist(id: string, placement: Placement) {
    startTransition(() => {
      updateFurniturePlacement(id, props.room.id, placement.x, placement.z, placement.rotationY);
    });
  }

  function onOpenFurniture(id: string) {
    router.push(`/home/rooms/${props.room.id}/furniture/${id}`);
  }

  return (
    <div className={props.className}>
      <Canvas orthographic shadows dpr={[1, 2]} gl={{ antialias: true }} camera={{ position: [0, 12, 0], zoom: 1 }}>
        <color attach="background" args={["#f5f2ea"]} />
        <SceneContents
          room={props.room}
          furniture={props.furniture}
          itemCountByFurniture={props.itemCountByFurniture}
          onPersist={onPersist}
          onOpenFurniture={onOpenFurniture}
        />
      </Canvas>
    </div>
  );
}
