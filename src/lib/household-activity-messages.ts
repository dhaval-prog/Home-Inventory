/**
 * Turns a raw household_activity row into a friendly sentence — the payload
 * is intentionally small (ids/amounts/names), never a member's private
 * financial data. A plain module (not a "use server" actions file, which may
 * only export async functions) so both household-dashboard.ts's full
 * activity feed and split.ts's split-only-scoped feed can share it.
 */
export function describeActivity(kind: string, actorName: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case "contribution": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      const vaultName = typeof payload.vault_name === "string" ? payload.vault_name : "the household vault";
      return `${actorName} contributed ₹${Math.round(amount).toLocaleString("en-IN")} to ${vaultName}`;
    }
    case "goal_created": {
      const name = typeof payload.name === "string" ? payload.name : "a goal";
      return `${actorName} created the "${name}" goal`;
    }
    case "goal_completed": {
      const name = typeof payload.name === "string" ? payload.name : "a goal";
      return `🎉 "${name}" reached its savings target!`;
    }
    case "goal_deleted": {
      const name = typeof payload.name === "string" ? payload.name : "a goal";
      return `${actorName} deleted the "${name}" goal`;
    }
    case "member_joined":
      return `${actorName} joined the household`;
    case "expense_added": {
      const description = typeof payload.description === "string" ? payload.description : "an expense";
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      const payerName = typeof payload.payer_name === "string" ? payload.payer_name : actorName;
      return `${payerName} paid ₹${Math.round(amount).toLocaleString("en-IN")} for "${description}"`;
    }
    case "expense_deleted": {
      const description = typeof payload.description === "string" ? payload.description : "an expense";
      return `${actorName} deleted the "${description}" expense`;
    }
    case "settlement_recorded": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      const fromName = typeof payload.from_name === "string" ? payload.from_name : "Someone";
      const toName = typeof payload.to_name === "string" ? payload.to_name : "Someone";
      return `${fromName} paid ${toName} ₹${Math.round(amount).toLocaleString("en-IN")}`;
    }
    default:
      return `${actorName} updated the household`;
  }
}
