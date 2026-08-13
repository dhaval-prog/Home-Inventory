"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getIcon } from "@/lib/icon-map";
import { HOME_TYPE_META } from "@/lib/constants";
import { createHome } from "@/lib/actions/homes";
import type { HomeType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const TYPES: HomeType[] = ["1bhk", "2bhk", "3bhk", "custom"];

export default function NewHomePage() {
  const [name, setName] = useState("My Home");
  const [selected, setSelected] = useState<HomeType>("2bhk");
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your home</h1>
        <p className="mt-1 text-muted-foreground">
          Pick a layout to get started — we&apos;ll set up the rooms for you.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="home-name">Home name</Label>
        <Input
          id="home-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Apartment"
          className="max-w-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TYPES.map((type) => {
          const meta = HOME_TYPE_META[type];
          const Icon = getIcon(meta.icon);
          const active = selected === type;
          return (
            <button
              key={type}
              onClick={() => setSelected(type)}
              className={cn(
                "relative flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-colors",
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
              )}
            >
              {active && (
                <span className="absolute right-4 top-4 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3.5" />
                </span>
              )}
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">{meta.label}</p>
                <p className="text-sm text-muted-foreground">{meta.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <Button
        size="lg"
        disabled={pending || !name.trim()}
        onClick={() =>
          startTransition(() => {
            createHome(name.trim(), selected);
          })
        }
      >
        {pending ? "Creating…" : "Create Home"}
      </Button>
    </div>
  );
}
