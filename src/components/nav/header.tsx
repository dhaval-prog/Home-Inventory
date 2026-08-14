import Link from "next/link";
import { Home } from "lucide-react";
import { HeaderSearch } from "@/components/search/header-search";
import { UserMenu } from "@/components/nav/user-menu";

export function Header({ name, email }: { name: string; email: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 md:px-6 md:py-4">
      <Link href="/dashboard" className="flex items-center gap-2 font-semibold md:hidden">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Home className="size-4" />
        </span>
      </Link>

      <HeaderSearch className="max-w-md flex-1" />

      <div className="hidden md:ml-auto md:block" />
      <UserMenu name={name} email={email} />
    </header>
  );
}
