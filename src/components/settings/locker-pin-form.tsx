"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearStoredLockerPin, getStoredLockerPin, setStoredLockerPin } from "@/lib/locker-pin";

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function LockerPinForm() {
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasPin(getStoredLockerPin() !== null);
  }, []);

  function handleSave() {
    if (pin.length !== 4) {
      setMessage({ kind: "error", text: "Enter a 4-digit PIN." });
      return;
    }
    setStoredLockerPin(pin);
    setHasPin(true);
    setPin("");
    setMessage({ kind: "success", text: "PIN saved." });
  }

  function handleRemove() {
    clearStoredLockerPin();
    setHasPin(false);
    setPin("");
    setMessage({ kind: "success", text: "PIN removed." });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="locker-pin">{hasPin ? "Update PIN" : "Set a PIN"}</Label>
        <Input
          id="locker-pin"
          inputMode="numeric"
          type="password"
          maxLength={4}
          placeholder="4-digit PIN"
          value={pin}
          onChange={(e) => setPin(sanitizeDigits(e.target.value))}
          className="max-w-40"
        />
      </div>

      {message && (
        <p
          className={
            message.kind === "success"
              ? "rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600"
              : "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave}>
          <Lock className="size-4" />
          {hasPin ? "Update PIN" : "Save PIN"}
        </Button>
        {hasPin && (
          <Button variant="outline" onClick={handleRemove}>
            Remove PIN
          </Button>
        )}
      </div>
    </div>
  );
}
