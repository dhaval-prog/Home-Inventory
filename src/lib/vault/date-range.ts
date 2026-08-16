/**
 * Parses natural date references ("today", "last month", "three days ago",
 * "last Friday", "since the beginning of the month", ...) into a concrete
 * [from, to] instant range for filtering vault_transactions.created_at.
 *
 * Boundaries are computed in the server's local time zone — this app has no
 * per-user time zone stored anywhere, so "today"/"this month" etc. are
 * necessarily relative to wherever the server runs, same simplification the
 * rest of the vault already makes (see vault.html's original hardcoded NOW).
 */

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}
function startOfWeek(d: Date): Date {
  const dow = d.getDay(); // 0 = Sunday
  const daysSinceMonday = (dow + 6) % 7;
  return startOfDay(addDays(d, -daysSinceMonday));
}
function endOfWeek(d: Date): Date {
  return endOfDay(addDays(startOfWeek(d), 6));
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function parseDateRange(rawPhrase: string, now: Date = new Date()): DateRange | null {
  const phrase = rawPhrase.toLowerCase().trim();
  if (!phrase) return null;

  if (/\btoday\b/.test(phrase)) return { from: startOfDay(now), to: endOfDay(now), label: "today" };
  if (/\byesterday\b/.test(phrase)) {
    const d = addDays(now, -1);
    return { from: startOfDay(d), to: endOfDay(d), label: "yesterday" };
  }
  if (/\btomorrow\b/.test(phrase)) {
    const d = addDays(now, 1);
    return { from: startOfDay(d), to: endOfDay(d), label: "tomorrow" };
  }

  if (/\bthis\s+week\b/.test(phrase)) return { from: startOfWeek(now), to: endOfWeek(now), label: "this week" };
  if (/\blast\s+week\b/.test(phrase)) {
    const s = addDays(startOfWeek(now), -7);
    return { from: s, to: endOfDay(addDays(s, 6)), label: "last week" };
  }

  if (/\bthis\s+month\b/.test(phrase)) return { from: startOfMonth(now), to: endOfMonth(now), label: "this month" };
  if (/\blast\s+month\b/.test(phrase)) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: startOfMonth(prev), to: endOfMonth(prev), label: "last month" };
  }

  if (/\bthis\s+year\b/.test(phrase)) return { from: startOfYear(now), to: endOfYear(now), label: "this year" };
  if (/\blast\s+year\b/.test(phrase)) {
    const prev = new Date(now.getFullYear() - 1, 0, 1);
    return { from: startOfYear(prev), to: endOfYear(prev), label: "last year" };
  }

  if (/\bsince\s+(?:the\s+)?(?:beginning|start)\s+of\s+(?:the\s+)?month\b/.test(phrase)) {
    return { from: startOfMonth(now), to: endOfDay(now), label: "since the start of the month" };
  }

  const daysAgoMatch = phrase.match(/\b(\d+)\s+days?\s+ago\b/);
  if (daysAgoMatch) {
    const n = parseInt(daysAgoMatch[1], 10);
    const d = addDays(now, -n);
    return { from: startOfDay(d), to: endOfDay(d), label: `${n} days ago` };
  }

  const weekdayMatch = phrase.match(new RegExp(`\\b(last\\s+)?(${WEEKDAYS.join("|")})\\b`));
  if (weekdayMatch) {
    const hasLast = Boolean(weekdayMatch[1]);
    const targetDow = WEEKDAYS.indexOf(weekdayMatch[2]);
    let diff = (now.getDay() - targetDow + 7) % 7;
    // "last Friday" said on a Friday means the previous one, not today;
    // bare "Friday" said on a Friday means today.
    if (diff === 0 && hasLast) diff = 7;
    const d = addDays(now, -diff);
    return { from: startOfDay(d), to: endOfDay(d), label: weekdayMatch[2] };
  }

  return null;
}
