import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function relativeDay(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** A member's display name, always derived from their own profile — never a hardcoded label. Falls back to their email's local part when they haven't set a name, matching handle_new_user()'s own fallback in supabase/schema.sql. */
export function displayName(profile: { name?: string | null; email?: string | null } | null | undefined): string {
  const name = profile?.name?.trim();
  if (name) return name;
  const emailPrefix = profile?.email?.split("@")[0]?.trim();
  return emailPrefix || "Member";
}
