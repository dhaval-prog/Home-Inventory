"use client";

import { useState } from "react";
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
  Lock,
  ShieldCheck,
  Users,
  Settings,
  Menu,
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
  Lock,
  ShieldCheck,
  Users,
  Settings,
};

export function Sidebar({ homeName }: { homeName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className={cn(
          "fixed top-5 left-4 z-50 hidden size-10 items-center justify-center rounded-full border border-white/70 bg-white/70 text-foreground/70 shadow-sm backdrop-blur-xl transition-opacity hover:text-foreground md:flex",
          open && "pointer-events-none opacity-0"
        )}
      >
        <Menu className="size-4.5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 hidden bg-black/20 backdrop-blur-[1px] md:block"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden w-64 shrink-0 -translate-x-full flex-col gap-5 border-r border-white/70 bg-white/80 px-4 py-5 shadow-xl backdrop-blur-xl transition-transform duration-200 ease-out md:flex",
          open && "translate-x-0"
        )}
      >
        <div className="flex items-center gap-2.5 px-2 text-base font-semibold tracking-tight">
          <span className="flex size-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Home className="size-3.5" />
          </span>
          Home Inventory
        </div>

        <QuickAddMenu className="w-full justify-start rounded-full px-4" />

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-white text-foreground shadow-sm"
                    : "text-foreground/65 hover:bg-white/50 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {item.label === "My Home" && homeName ? homeName : item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
