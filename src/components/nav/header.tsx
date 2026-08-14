import Link from "next/link";
import { Home, Search } from "lucide-react";
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

      <HeaderSearch className="hidden max-w-md flex-1 md:block" />

      <Link
        href="/search"
        className="ml-auto flex size-9 items-center justify-center rounded-full text-foreground/60 hover:bg-white/50 md:hidden"
      >
        <Search className="size-5" />
      </Link>

      <div className="hidden md:ml-auto md:block" />
      <UserMenu name={name} email={email} />
    </header>
  );
}
