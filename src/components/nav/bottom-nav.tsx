"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Package, User, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickAddMenu } from "@/components/nav/quick-add-menu";

const TABS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/items", label: "Items", icon: Package },
  { href: "/settings", label: "Me", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {TABS.slice(0, 2).map((tab) => (
        <BottomNavLink key={tab.href} tab={tab} active={pathname.startsWith(tab.href)} />
      ))}

      <div className="-mt-5">
        <QuickAddMenu
          trigger={
            <button
              aria-label="Quick add"
              className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          }
        />
      </div>

      {TABS.slice(2).map((tab) => (
        <BottomNavLink key={tab.href} tab={tab} active={pathname.startsWith(tab.href)} />
      ))}
    </nav>
  );
}

function BottomNavLink({
  tab,
  active,
}: {
  tab: { href: string; label: string; icon: typeof Home };
  active: boolean;
}) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className="size-5" />
      {tab.label}
    </Link>
  );
}
