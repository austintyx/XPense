import type { Transaction } from "../api/client";
import type { CategoryId } from "../theme/tokens";

export function formatMoney(amount: number | string, decimals = true): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (decimals) {
    return "S$" + value.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return "S$" + Math.round(value).toLocaleString("en-SG");
}

export function deriveSource(txn: Pick<Transaction, "provider" | "bank">): string {
  if (txn.provider) {
    return txn.bank ? `Email · ${txn.bank}` : "Email";
  }
  return "Manual";
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameLocalDay(date, now)) return "Today";
  if (isSameLocalDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const timePart = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

export interface DayGroup {
  label: string;
  total: number;
  items: Transaction[];
}

/** Groups already-expense-filtered transactions by calendar day, newest group first, rows
 * within a group preserving the caller's (already txn_at-desc) ordering. */
export function groupByDay(transactions: Transaction[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  const indexByLabel = new Map<string, number>();

  for (const txn of transactions) {
    const label = dayLabel(txn.txn_at, now);
    let idx = indexByLabel.get(label);
    if (idx === undefined) {
      idx = groups.length;
      indexByLabel.set(label, idx);
      groups.push({ label, total: 0, items: [] });
    }
    groups[idx].items.push(txn);
    groups[idx].total += Number(txn.amount);
  }

  return groups;
}

export function isExpense(txn: Transaction): boolean {
  return txn.type === "expense";
}

export function categoryTotals(transactions: Transaction[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const txn of transactions) {
    if (!isExpense(txn) || !txn.category) continue;
    totals[txn.category] = (totals[txn.category] ?? 0) + Number(txn.amount);
  }
  return totals;
}

export interface CategoryTotal {
  category: CategoryId;
  total: number;
}

export function topCategories(transactions: Transaction[], limit = 4): CategoryTotal[] {
  const totals = categoryTotals(transactions);
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, total]) => ({ category: category as CategoryId, total }));
}

export function subcategoryTotals(transactions: Transaction[], category: string): [string, number][] {
  const totals: Record<string, number> = {};
  for (const txn of transactions) {
    if (!isExpense(txn) || txn.category !== category || !txn.subcategory) continue;
    totals[txn.subcategory] = (totals[txn.subcategory] ?? 0) + Number(txn.amount);
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

export function todaySpend(transactions: Transaction[], now: Date = new Date()): number {
  return transactions
    .filter((t) => isExpense(t) && isSameLocalDay(new Date(t.txn_at), now))
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

export function weekSpend(transactions: Transaction[], now: Date = new Date()): number {
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);
  return transactions
    .filter((t) => isExpense(t) && new Date(t.txn_at) >= weekAgo && new Date(t.txn_at) <= now)
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

/** Daily totals for a given local year/month (0-indexed month), index 0 = the 1st. */
export function calendarDailyTotals(transactions: Transaction[], year: number, month: number): number[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totals = new Array(daysInMonth).fill(0) as number[];
  for (const txn of transactions) {
    if (!isExpense(txn)) continue;
    const date = new Date(txn.txn_at);
    if (date.getFullYear() === year && date.getMonth() === month) {
      totals[date.getDate() - 1] += Number(txn.amount);
    }
  }
  return totals;
}

/** 0 = Sunday, matching the design's weekday header order (S M T W T F S). */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function uncategorized(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => isExpense(t) && !t.category);
}

export function todayRangeTransactions(transactions: Transaction[], now: Date = new Date()): Transaction[] {
  return transactions.filter((t) => isExpense(t) && isSameLocalDay(new Date(t.txn_at), now));
}

export function categoryTransactions(transactions: Transaction[], category: string): Transaction[] {
  return transactions
    .filter((t) => isExpense(t) && t.category === category)
    .sort((a, b) => new Date(b.txn_at).getTime() - new Date(a.txn_at).getTime());
}

export function weekRangeTransactions(transactions: Transaction[], now: Date = new Date()): Transaction[] {
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);
  return transactions.filter((t) => {
    const date = new Date(t.txn_at);
    return date >= weekAgo && date <= now;
  });
}

export function yearRangeTransactions(transactions: Transaction[], now: Date = new Date()): Transaction[] {
  return transactions.filter((t) => new Date(t.txn_at).getFullYear() === now.getFullYear());
}

/** Same current-calendar-month window `GET /summary` uses server-side, so client-derived
 * breakdowns (e.g. Food subcategory bars) stay in scope with the summary total shown alongside
 * them. */
export function currentMonthTransactions(transactions: Transaction[], now: Date = new Date()): Transaction[] {
  return transactions.filter((t) => {
    const date = new Date(t.txn_at);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Sunday-start calendar week containing `date`, matching the calendar grid's S M T W T F S
 * header -- distinct from Home's rolling trailing-7-days `weekRangeTransactions`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function calendarWeekTransactions(transactions: Transaction[], anchor: Date): Transaction[] {
  const start = startOfWeek(anchor);
  const end = endOfWeek(anchor);
  return transactions.filter((t) => {
    if (!isExpense(t)) return false;
    const date = new Date(t.txn_at);
    return date >= start && date <= end;
  });
}

/** Chunks a leading-blanks count + a month's daily totals into rows of exactly 7 cells (day
 * number, 1-indexed; `-1` for a blank/no-day cell), padding the final row with trailing blanks.
 * React Native has no CSS grid, and a flat `flexWrap` row of `width: '${100/7}%'` cells drops a
 * column (visually) because 100/7 is a repeating decimal that rounds over 100% across 7 siblings
 * -- chunking into fixed rows of `flex: 1` cells sidesteps that entirely. */
export function calendarWeeks(leadingBlanks: number, dailyAmounts: number[]): number[][] {
  const cells: number[] = [
    ...new Array(leadingBlanks).fill(-1),
    ...dailyAmounts.map((_, idx) => idx + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(-1);

  const weeks: number[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
