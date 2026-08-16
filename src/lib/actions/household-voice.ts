"use server";

import { fuzzyMatchByName } from "@/lib/voice/synonyms";
import { listGoals, contributeToGoal, type HouseholdGoalSummary } from "@/lib/actions/household-goals";
import { getHouseholdSummary } from "@/lib/actions/household-dashboard";
import type { VaultAction } from "@/lib/voice/types";
import type { VaultVoiceResult } from "@/lib/actions/vault-voice";

/**
 * Orchestrates the two household-scoped vault intents (check_household_balance,
 * contribute_household_goal) — reuses the exact same VaultVoiceResult shape
 * as the personal vault orchestrator (src/lib/actions/vault-voice.ts) so
 * VoiceSearchPanel renders both through one shared UI, per the "one intent
 * architecture, not three separate systems" mandate. Never touches the DB
 * directly: every write goes through household-goals.ts's contributeToGoal,
 * which in turn calls the atomic contribute_to_household_vault RPC.
 *
 * Scope trim for this pass: unlike the personal vault assistant, this does
 * NOT support multi-turn clarify/disambiguate continuation (that machinery
 * lives in vault-voice.ts and is tailored to transaction references, not
 * goal names) — a missing amount or an ambiguous goal name gets a helpful
 * one-shot error message instead of a follow-up question.
 */

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

async function resolveGoal(
  householdId: string,
  goalName: string | null
): Promise<{ goal: HouseholdGoalSummary | null; all: HouseholdGoalSummary[] }> {
  const all = await listGoals(householdId, { status: "active" });
  if (!goalName) return { goal: null, all };

  const match = fuzzyMatchByName(
    goalName,
    all.map((g) => ({ id: g.goal.id, name: g.goal.name }))
  );
  return { goal: match ? (all.find((g) => g.goal.id === match.id) ?? null) : null, all };
}

export async function handleCheckHouseholdBalance(householdId: string, action: VaultAction): Promise<VaultVoiceResult> {
  const { goal, all } = await resolveGoal(householdId, action.goalName);

  if (action.goalName && !goal) {
    return { kind: "vault-error", message: `I couldn't find a goal called "${action.goalName}" in this household.` };
  }

  if (goal) {
    const remaining = Math.max(0, goal.goal.target_amount - goal.currentAmount);
    return {
      kind: "vault-answer",
      intent: "check_household_balance",
      message:
        remaining > 0
          ? `You've saved ${inr(goal.currentAmount)} of ${inr(goal.goal.target_amount)} for ${goal.goal.name} — ${inr(remaining)} more to go.`
          : `${goal.goal.name} is fully funded at ${inr(goal.currentAmount)}! 🎉`,
      amount: goal.currentAmount,
    };
  }

  const summary = await getHouseholdSummary(householdId);
  if (!summary) return { kind: "vault-error", message: "I couldn't load this household's savings." };

  return {
    kind: "vault-answer",
    intent: "check_household_balance",
    message: `Your household has saved ${inr(summary.totalSharedSavings)} across ${all.length} goal${all.length === 1 ? "" : "s"}.`,
    amount: summary.totalSharedSavings,
  };
}

export async function handleContributeHouseholdGoal(householdId: string, action: VaultAction): Promise<VaultVoiceResult> {
  if (action.amount == null) {
    return { kind: "vault-error", message: 'How much would you like to contribute? Try "contribute 2000 to the vacation fund."' };
  }

  const { goal, all } = await resolveGoal(householdId, action.goalName);
  const target = goal ?? (!action.goalName && all.length === 1 ? all[0] : null);

  if (!target) {
    if (all.length === 0) return { kind: "vault-error", message: "This household doesn't have any savings goals yet — create one first." };
    return { kind: "vault-error", message: `Which goal did you mean? This household has: ${all.map((g) => g.goal.name).join(", ")}.` };
  }

  const result = await contributeToGoal(target.goal.id, action.amount, "personal_vault", action.comment);
  if ("error" in result) return { kind: "vault-error", message: result.error };

  return {
    kind: "vault-executed",
    intent: "contribute_household_goal",
    message: `+ ${inr(action.amount)} → ${target.goal.name}`,
    amount: action.amount,
    category: target.goal.name,
  };
}

export async function processHouseholdVoiceCommand(householdId: string, action: VaultAction): Promise<VaultVoiceResult> {
  if (action.intent === "check_household_balance") return handleCheckHouseholdBalance(householdId, action);
  return handleContributeHouseholdGoal(householdId, action);
}
