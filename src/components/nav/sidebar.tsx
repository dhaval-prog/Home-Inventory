"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Home,
  Search,
  Package,
  Star,
  AlertTriangle,
  Clock,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/nav/nav-items";
import { QuickAddMenu } from "@/components/nav/quick-add-menu";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Home,
  Search,
  Package,
  Star,
  AlertTriangle,
  Clock,
  Settings,
};

export function Sidebar({ homeName }: { homeName?: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar px-4 py-6 md:flex">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Home className="size-4" />
        </span>
        Home Inventory
      </Link>

      <div className="mb-4 px-2">
        <QuickAddMenu className="w-full justify-start" />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label === "My Home" && homeName ? homeName : item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
