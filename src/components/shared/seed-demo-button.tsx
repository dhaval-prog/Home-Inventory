"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seedDemoData } from "@/lib/actions/seed";
import { toast } from "sonner";

export function SeedDemoButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await seedDemoData();
          } catch (e) {
            const digest = (e as { digest?: string } | null)?.digest;
            if (digest?.startsWith("NEXT_REDIRECT")) throw e;
            toast.error("Couldn't load demo data. Please try again.");
          }
        })
      }
    >
      <Sparkles className="size-4" />
      {pending ? "Loading demo data…" : "Try with demo data"}
    </Button>
  );
}
