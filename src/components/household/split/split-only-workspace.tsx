import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ShieldAlert } from "lucide-react";
import { initials } from "@/lib/utils";
import { HouseholdSwitcher } from "@/components/household/household-switcher";
import { AddExpenseDialog } from "@/components/household/split/add-expense-dialog";
import { SplitDashboard } from "@/components/household/split/split-dashboard";
import type { SplitSummary, SplitActivityEntry } from "@/lib/actions/split";
import type { HouseholdMemberLite } from "@/components/household/finance-toggle";
import type { HouseholdListEntry } from "@/lib/actions/household";

/**
 * The entire Home dashboard for a `split_only` member (SPLIT_ACCESS only —
 * see has_home_access() in supabase/schema.sql). Deliberately a different
 * page, not the normal dashboard with cards hidden: it never fetches
 * household savings/goals/members/activity data in the first place, so
 * there's nothing to leak even if the UI were bypassed — every query this
 * page makes is already scoped to the split group by RLS. Built to read as
 * its own focused workspace, not a stripped-down Home page.
 */
export function SplitOnlyWorkspace({
  householdId,
  householdName,
  currentUserId,
  splitSummary,
  members,
  activity,
  households,
}: {
  householdId: string;
  householdName: string;
  currentUserId: string;
  splitSummary: SplitSummary | null;
  members: HouseholdMemberLite[];
  activity: SplitActivityEntry[];
  households: HouseholdListEntry[];
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">🤝 Let&apos;s Split</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Shared expenses in {householdName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HouseholdSwitcher households={households} currentId={householdId} />
          {splitSummary && <AddExpenseDialog householdId={householdId} members={members} currentUserId={currentUserId} />}
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border bg-muted/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          You have access to this household&apos;s shared expenses only — not its savings, goals, member list, or chat.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader className="p-0">
              <h3 className="text-[17px] font-semibold tracking-tight">My Balance</h3>
            </CardHeader>
            <CardContent className="mt-3 p-0">
              {splitSummary ? (
                // A split_only member is never this group's creator or the
                // household owner (handle_new_household always makes the
                // household owner the default group's creator) — Invite
                // Members stays hidden for them, same as any other member.
                <SplitDashboard
                  householdId={householdId}
                  summary={splitSummary}
                  members={members}
                  currentUserId={currentUserId}
                  isOwner={false}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t been added to a split group in this household yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader className="flex-row items-baseline p-0">
              <h3 className="text-[17px] font-semibold tracking-tight">Split Group Members</h3>
            </CardHeader>
            <CardContent className="mt-3 p-0">
              <ul className="space-y-3">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2.5 text-sm">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium">{m.name}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="p-5">
            <CardHeader className="p-0">
              <h3 className="text-[17px] font-semibold tracking-tight">Activity</h3>
            </CardHeader>
            <CardContent className="mt-3 p-0">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet — activity will show up here as expenses are added and settled.</p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((a) => (
                    <li key={a.id} className="text-sm">
                      <p>{a.message}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("en-IN")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
