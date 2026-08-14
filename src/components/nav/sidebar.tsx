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
    <aside className="hidden w-64 shrink-0 flex-col gap-5 border-r border-white/70 bg-white/55 px-4 py-5 backdrop-blur-xl md:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 text-base font-semibold tracking-tight">
        <span className="flex size-[30px] items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Home className="size-3.5" />
        </span>
        Home Inventory
      </Link>

      <QuickAddMenu className="w-full justify-start rounded-full px-4" />

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
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
  );
}
