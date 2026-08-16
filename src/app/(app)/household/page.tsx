import { redirect } from "next/navigation";
import { listMyHouseholds, getHouseholdContext } from "@/lib/actions/household";
import { getHouseholdSummary } from "@/lib/actions/household-dashboard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { HouseholdSwitcher } from "@/components/household/household-switcher";
import { InviteMemberDialog } from "@/components/household/invite-member-dialog";
import { CreateGoalDialog } from "@/components/household/create-goal-dialog";
import { CreateHouseholdCta } from "@/components/household/create-household-cta";
import { JoinHouseholdCta } from "@/components/household/join-household-cta";
import { GoalCard } from "@/components/household/goal-card";
import { MemberRow } from "@/components/household/member-row";

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default async function HouseholdPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const memberships = await listMyHouseholds();

  if (memberships.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
        <EmptyState
          icon="Home"
          title="My Money. Our Goals. Our Home."
          description="Create a household to pool savings with the people you share a home with — everyone keeps a private vault, and you decide what to share."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <CreateHouseholdCta />
              <JoinHouseholdCta />
            </div>
          }
        />
      </div>
    );
  }

  const householdId = id && memberships.some((m) => m.household.id === id) ? id : memberships[0].household.id;
  const [context, summary] = await Promise.all([getHouseholdContext(householdId), getHouseholdSummary(householdId)]);

  if (!context || !summary) redirect(`/household?id=${memberships[0].household.id}`);

  const isOwner = context.myRole === "owner";
  const myUserId = context.members.find((m) => m.isMe)?.userId;
  const activeGoals = summary.goals.filter((g) => g.goal.status === "active");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{context.household.name}</h1>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono text-muted-foreground">{context.household.code}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {context.members.length} member{context.members.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HouseholdSwitcher households={memberships} currentId={householdId} />
          <InviteMemberDialog householdId={householdId} />
          <CreateGoalDialog householdId={householdId} />
        </div>
      </div>

      <Card className="p-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Household Savings</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">{inr(summary.totalSharedSavings)}</p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader className="flex-row items-baseline p-0">
              <h3 className="text-[17px] font-semibold tracking-tight">Savings Goals</h3>
            </CardHeader>
            <CardContent className="mt-3 space-y-3 p-0">
              {activeGoals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No goals yet — create one to start saving toward something together.</p>
              ) : (
                activeGoals.map((g) => <GoalCard key={g.goal.id} summary={g} />)
              )}
            </CardContent>
          </Card>

          <Card className="p-5">
            <CardHeader className="flex-row items-baseline p-0">
              <h3 className="text-[17px] font-semibold tracking-tight">Members</h3>
            </CardHeader>
            <CardContent className="mt-3 p-0">
              <ul className="space-y-3">
                {summary.memberContributions.map((m) => (
                  <MemberRow
                    key={m.userId}
                    householdId={householdId}
                    userId={m.userId}
                    name={m.name}
                    role={context.members.find((cm) => cm.userId === m.userId)?.role ?? "member"}
                    totalContributed={m.totalContributed}
                    canRemove={isOwner && m.userId !== myUserId}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader className="p-0">
              <h3 className="text-[17px] font-semibold tracking-tight">Recent Activity</h3>
            </CardHeader>
            <CardContent className="mt-3 p-0">
              {summary.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet — activity will show up here as your household saves together.</p>
              ) : (
                <ul className="space-y-3">
                  {summary.activity.map((a) => (
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
