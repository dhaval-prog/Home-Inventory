"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStoredLockerPin } from "@/lib/locker-pin";

const DIGIT_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

function KeypadButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: "digit" | "action";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex aspect-square items-center justify-center rounded-2xl shadow-[0_2px_0_rgba(0,0,0,0.15)] transition-transform active:scale-95 active:shadow-none " +
        (variant === "digit"
          ? "bg-[#e0342f] text-2xl font-bold text-white"
          : "bg-[#1a1a1a] text-[11px] font-bold tracking-wide text-white")
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
    <div className="mx-auto max-w-xs">
      <div
        className={
          "rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-black/5" + (error ? " animate-locker-shake" : "")
        }
      >
        <div className="mb-5 flex h-14 items-center justify-center gap-3 rounded-xl bg-[#1a1a1a]">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={"size-3 rounded-full transition-colors " + (i < entered.length ? "bg-white" : "bg-white/20")}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
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
