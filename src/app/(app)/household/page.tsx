import { redirect } from "next/navigation";
import { listMyHouseholds, getHouseholdContext } from "@/lib/actions/household";
import { getHouseholdSummary } from "@/lib/actions/household-dashboard";
import { listHouseholdMessages } from "@/lib/actions/household-chat";
import { getSplitSummary, getSplitGroupMembers, getSplitActivity, getDefaultGroupId } from "@/lib/actions/split";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { HouseholdSwitcher } from "@/components/household/household-switcher";
import { InviteMemberDialog } from "@/components/household/invite-member-dialog";
import { CreateHouseholdCta } from "@/components/household/create-household-cta";
import { JoinHouseholdCta } from "@/components/household/join-household-cta";
import { HouseholdFinanceCard, FinanceToggle } from "@/components/household/finance-toggle";
import { FinanceTabProvider } from "@/components/household/finance-tab-context";
import { SplitOnlyWorkspace } from "@/components/household/split/split-only-workspace";
import { MemberRow } from "@/components/household/member-row";
import { ChatPanel } from "@/components/household/chat-panel";

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
  const context = await getHouseholdContext(householdId);
  if (!context) redirect(`/household?id=${memberships[0].household.id}`);

  // A split_only member gets SPLIT_ACCESS only (see has_home_access() in
  // supabase/schema.sql) — a completely different, narrower page, not the
  // normal dashboard with cards hidden. It never even requests household
  // savings/goals/members/activity data, so there's nothing to leak.
  if (context.myRole === "split_only") {
    const groupId = await getDefaultGroupId(householdId);
    const [splitSummary, splitMembers, activity] = await Promise.all([
      getSplitSummary(householdId),
      groupId ? getSplitGroupMembers(groupId) : Promise.resolve([]),
      getSplitActivity(householdId),
    ]);
    const myUserId = context.members.find((m) => m.isMe)?.userId ?? "";
    return (
      <SplitOnlyWorkspace
        householdId={householdId}
        householdName={context.household.name}
        currentUserId={myUserId}
        splitSummary={splitSummary}
        members={splitMembers}
        activity={activity}
        households={memberships}
      />
    );
  }

  const groupId = await getDefaultGroupId(householdId);
  const [summary, messages, splitSummary, splitGroupMembers] = await Promise.all([
    getHouseholdSummary(householdId),
    listHouseholdMessages(householdId),
    getSplitSummary(householdId),
    groupId ? getSplitGroupMembers(groupId) : Promise.resolve([]),
  ]);

  if (!summary) redirect(`/household?id=${memberships[0].household.id}`);

  const isOwner = context.myRole === "owner";
  const canInvite = context.myRole === "owner" || context.myRole === "co_owner";
  const myUserId = context.members.find((m) => m.isMe)?.userId;
  const activeGoals = summary.goals.filter((g) => g.goal.status === "active");

  return (
    <FinanceTabProvider>
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
            <FinanceToggle />
            <InviteMemberDialog householdId={householdId} canInvite={canInvite} />
          </div>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <Card className="p-6">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Household Savings</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight">{inr(summary.totalSharedSavings)}</p>
            </Card>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-5">
                <HouseholdFinanceCard
                  householdId={householdId}
                  activeGoals={activeGoals}
                  isOwner={isOwner}
                  myUserId={myUserId ?? ""}
                  splitSummary={splitSummary}
                  members={splitGroupMembers}
                />

                <Card className="p-5">
                  <CardHeader className="flex-row items-baseline p-0">
                    <h3 className="text-[17px] font-semibold tracking-tight">Members</h3>
                  </CardHeader>
                  <CardContent className="mt-3 p-0">
                    <ul className="space-y-3">
                      {summary.memberContributions.map((m) => {
                        const role = context.members.find((cm) => cm.userId === m.userId)?.role ?? "member";
                        return (
                          <MemberRow
                            key={m.userId}
                            householdId={householdId}
                            userId={m.userId}
                            name={m.name}
                            role={role}
                            totalContributed={m.totalContributed}
                            canRemove={isOwner && m.userId !== myUserId}
                            canPromote={isOwner && role === "member" && m.userId !== myUserId}
                          />
                        );
                      })}
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
          </TabsContent>

          <TabsContent value="chat">
            <ChatPanel householdId={householdId} currentUserId={myUserId ?? ""} initialMessages={messages} />
          </TabsContent>
        </Tabs>
      </div>
    </FinanceTabProvider>
  );
}
