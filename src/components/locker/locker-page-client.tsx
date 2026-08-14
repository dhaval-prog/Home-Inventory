"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStoredLockerPin } from "@/lib/locker-pin";

const DIGIT_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

const REST_TILT = { x: 10, y: -12 };
const RAISE_PX = 7;

function KeypadButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: "digit" | "action";
  onClick: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const isDigit = variant === "digit";
  const sideColor = isDigit ? "#8f1f1a" : "#000000";

  function release() {
    setPressed(false);
  }

  return (
    <button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={onClick}
      style={{
        background: isDigit
          ? "linear-gradient(180deg, #f0524a 0%, #c62a24 100%)"
          : "linear-gradient(180deg, #2e2e2e 0%, #0d0d0d 100%)",
        transform: `translateY(${pressed ? RAISE_PX - 1 : 0}px) translateZ(${pressed ? 2 : 14}px)`,
        boxShadow: pressed
          ? `0 1px 0 ${sideColor}, 0 2px 6px rgba(0,0,0,0.25)`
          : `0 ${RAISE_PX}px 0 ${sideColor}, 0 ${RAISE_PX + 6}px 14px rgba(0,0,0,0.3)`,
        transition: pressed ? "transform 70ms ease-out, box-shadow 70ms ease-out" : "transform 160ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 160ms ease-out",
      }}
      className={
        "flex aspect-square items-center justify-center rounded-2xl select-none " +
        (isDigit ? "text-2xl font-bold text-white" : "text-[11px] font-bold tracking-wide text-white")
      }
    >
      {label}
    </button>
  );
}

function Keypad({ storedPin }: { storedPin: string }) {
  const [entered, setEntered] = useState("");
  const [error, setError] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [tilt, setTilt] = useState(REST_TILT);
  const cardRef = useRef<HTMLDivElement>(null);

  function appendDigit(d: string) {
    if (entered.length >= 4) return;
    setError(false);
    setEntered((prev) => prev + d);
  }

  function handleEnter() {
    if (entered.length !== 4) return;
    if (entered === storedPin) {
      setUnlocked(true);
      return;
    }
    setError(true);
    setEntered("");
  }

  if (unlocked) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed bg-muted/30 px-6 py-16 text-center">
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <LockOpen className="size-7" />
        </span>
        <h3 className="text-lg font-semibold">Locker unlocked</h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Nothing stored here yet — this is a placeholder for now.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => setUnlocked(false)}>
          <Lock className="size-4" />
          Lock again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xs py-6" style={{ perspective: "1400px" }}>
      <div
        ref={cardRef}
        onPointerMove={(e) => {
          const rect = cardRef.current?.getBoundingClientRect();
          if (!rect) return;
          const px = (e.clientX - rect.left) / rect.width - 0.5;
          const py = (e.clientY - rect.top) / rect.height - 0.5;
          setTilt({ x: REST_TILT.x - py * 24, y: REST_TILT.y + px * 24 });
        }}
        onPointerLeave={() => setTilt(REST_TILT)}
        className={"animate-locker-materialize rounded-[2rem] bg-white p-5 ring-1 ring-black/5" + (error ? " animate-locker-shake" : "")}
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 200ms ease-out",
          boxShadow: "0 30px 60px -15px rgba(11,11,20,0.35), 0 10px 20px -8px rgba(11,11,20,0.2)",
        }}
      >
        <div
          className="mb-5 flex h-14 items-center justify-center gap-3 rounded-xl bg-[#1a1a1a]"
          style={{ transform: "translateZ(20px)", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)" }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={
                "size-3 rounded-full transition-all duration-200 " +
                (i < entered.length ? "scale-110 bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.6)]" : "bg-white/20")
              }
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3" style={{ transformStyle: "preserve-3d" }}>
          {DIGIT_ROWS.flat().map((d) => (
            <KeypadButton key={d} label={d} variant="digit" onClick={() => appendDigit(d)} />
          ))}
          <KeypadButton label="BURN" variant="action" onClick={() => setEntered("")} />
          <KeypadButton label="0" variant="digit" onClick={() => appendDigit("0")} />
          <KeypadButton label="ENTER" variant="action" onClick={handleEnter} />
        </div>
      </div>

      {error && <p className="mt-4 text-center text-sm text-destructive">Incorrect PIN. Try again.</p>}
    </div>
  );
}

export function LockerPageClient() {
  const [storedPin, setStoredPin] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStoredPin(getStoredLockerPin());
  }, []);

  if (storedPin === undefined) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Locker</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your PIN-protected private storage.</p>
      </div>

      {storedPin ? (
        <Keypad storedPin={storedPin} />
      ) : (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-muted/30 px-6 py-16 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Lock className="size-7" />
          </span>
          <h3 className="text-lg font-semibold">No PIN set</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Set a 4-digit PIN in Settings to enable your Locker.
          </p>
          <Button className="mt-6" render={<Link href="/settings">Go to Settings</Link>} />
        </div>
      )}
    </div>
  );
}
