import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">We couldn&apos;t find that</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page, room, or item doesn&apos;t exist — or may have been moved.
      </p>
      <Button render={<Link href="/dashboard">Back to dashboard</Link>} />
    </div>
  );
}
