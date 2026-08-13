import Link from "next/link";
import { Home } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Home className="size-5" />
        </span>
        Home Inventory
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
