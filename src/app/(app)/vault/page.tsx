import Link from "next/link";
import { listMyHouseholds } from "@/lib/actions/household";
import { getHouseholdSummary } from "@/lib/actions/household-dashboard";

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default async function VaultPage() {
  const memberships = await listMyHouseholds();
  const primary = memberships[0];
  const summary = primary ? await getHouseholdSummary(primary.household.id) : null;

  return (
    <div
      data-black-surface
      className="relative mt-4 h-[calc(100vh-4rem-1rem)] min-h-[560px] w-full overflow-hidden rounded-3xl md:h-[calc(100vh-2rem-1rem)]"
    >
      <iframe src="/vault/vault.html" title="Vault" className="size-full border-0" allow="fullscreen" />

      {/* Lightweight household-savings tie-in (spec §16) — the full multi-member
          experience (goals, contributions, members, activity) lives at
          /household; this is just a visible entry point from the vault. */}
      {primary && summary && (
        <Link
          href={`/household?id=${primary.household.id}`}
          className="absolute top-4 left-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-4 py-2 text-sm text-white backdrop-blur-md transition hover:bg-black/55"
        >
          🏠 {primary.household.name}
          <span className="font-semibold">{inr(summary.totalSharedSavings)}</span>
        </Link>
      )}
    </div>
  );
}
