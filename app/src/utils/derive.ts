import type { CustomCategory, CustomSubcategory, Transaction } from "../api/client";
import { CATEGORIES, CREDIT_CATEGORIES, subcategoriesFor, type CategoryId } from "../theme/tokens";

export function formatMoney(amount: number | string, decimals = true, currency?: string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  // A day group's total can go negative once transfers subtract from it (see groupByDay) -- put
  // the sign before the currency prefix ("-S$5.00"), not after it ("S$-5.00").
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  // Non-SGD amounts are shown in their own currency here, deliberately not converted -- this is
  // the original foreign figure a person expects to see for their own transaction. The
  // SGD-equivalent (from the backend's amount_sgd) is a separate, secondary display -- see
  // convertedAmountLabel() below for a single transaction, spendAmount() for totals/aggregates.
  const prefix = !currency || currency === "SGD" ? "S$" : `${currency} `;
  if (decimals) {
    return sign + prefix + abs.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return sign + prefix + Math.round(abs).toLocaleString("en-SG");
}

/** Curated common-travel-currency -> country/region names for a Singapore-based traveler.
 * Deliberately not exhaustive -- falls back to the raw currency code for anything unmapped rather
 * than guessing, since a wrong country label is worse than an honest currency code. */
export const CURRENCY_COUNTRY: Record<string, string> = {
  SGD: "Singapore",
  USD: "United States",
  EUR: "Eurozone",
  GBP: "United Kingdom",
  JPY: "Japan",
  CNY: "China",
  HKD: "Hong Kong",
  KRW: "South Korea",
  TWD: "Taiwan",
  THB: "Thailand",
  MYR: "Malaysia",
  IDR: "Indonesia",
  VND: "Vietnam",
  PHP: "Philippines",
  INR: "India",
  AUD: "Australia",
  NZD: "New Zealand",
  CAD: "Canada",
  CHF: "Switzerland",
  AED: "United Arab Emirates",
  MOP: "Macau",
  BND: "Brunei",
};

export function countryForCurrency(currency: string): string {
  return CURRENCY_COUNTRY[currency] ?? currency;
}

/** The country a transaction should be considered to be in: a human-entered/edited `country`
 * always wins (it's more precise -- a currency alone can't disambiguate e.g. any Eurozone
 * country), falling back to a currency-derived guess when nothing's been explicitly set. Single
 * source of truth for every place a transaction's country is displayed or filtered on. */
export function effectiveCountry(txn: Pick<Transaction, "country" | "currency">): string {
  return txn.country?.trim() || countryForCurrency(txn.currency);
}

/** Unique countries present across `transactions` -- drives the Activity/Summary country filter
 * pill lists. */
export function countriesInTransactions(transactions: Transaction[]): string[] {
  return [...new Set(transactions.map(effectiveCountry))];
}

export function deriveSource(txn: Pick<Transaction, "provider" | "bank">): string {
  if (txn.provider) {
    return txn.bank ? `Email · ${txn.bank}` : "Email";
  }
  return "Manual";
}

/** The amount to use for any total/aggregate (day groups, category totals, period totals, the
 * six-month trend, ...) -- the SGD-equivalent when available, falling back to the raw `amount`
 * only if a foreign-currency row was never converted (rate lookup failed). Per-transaction
 * display should keep using `amount`+`currency` directly (via formatMoney's `currency` param) so
 * the original foreign figure is never hidden -- this is only for numbers that are summed. */
export function spendAmount(txn: Pick<Transaction, "amount" | "amount_sgd">): number {
  return Number(txn.amount_sgd ?? txn.amount);
}

/** "≈ S$65.20"-style secondary line for a foreign-currency transaction's SGD-equivalent -- null
 * when there's nothing to add (already SGD, or the conversion never resolved). Callers render this
 * alongside the transaction's own-currency amount (never in place of it -- see formatMoney above). */
export function convertedAmountLabel(txn: Pick<Transaction, "currency" | "amount_sgd">): string | null {
  if (!txn.currency || txn.currency === "SGD" || txn.amount_sgd == null) return null;
  return `≈ ${formatMoney(txn.amount_sgd)}`;
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

/** Groups transactions by calendar day, newest group first, rows within a group preserving the
 * caller's (already txn_at-desc) ordering. Debits add to the day's total, credits subtract --
 * callers mixing both (Activity's "All" filter) get a net-spend total per day, not an inflated
 * sum of unrelated inflows and outflows. */
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
    groups[idx].total += txn.direction === "debit" ? spendAmount(txn) : -spendAmount(txn);
  }

  return groups;
}

export function isExpense(txn: Transaction): boolean {
  return txn.direction === "debit";
}

export function categoryTotals(transactions: Transaction[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const txn of transactions) {
    if (!isExpense(txn) || !txn.category) continue;
    totals[txn.category] = (totals[txn.category] ?? 0) + spendAmount(txn);
  }
  return totals;
}

/** Total expense spend regardless of category -- unlike summing categoryTotals(), this doesn't
 * silently drop uncategorized transactions, so it's the right source for a period's headline total. */
export function expenseTotal(transactions: Transaction[]): number {
  return transactions.filter(isExpense).reduce((sum, t) => sum + spendAmount(t), 0);
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
    totals[txn.subcategory] = (totals[txn.subcategory] ?? 0) + spendAmount(txn);
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

export function todaySpend(transactions: Transaction[], now: Date = new Date()): number {
  return transactions
    .filter((t) => isExpense(t) && isSameLocalDay(new Date(t.txn_at), now))
    .reduce((sum, t) => sum + spendAmount(t), 0);
}

export function weekSpend(transactions: Transaction[], now: Date = new Date()): number {
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);
  return transactions
    .filter((t) => isExpense(t) && new Date(t.txn_at) >= weekAgo && new Date(t.txn_at) <= now)
    .reduce((sum, t) => sum + spendAmount(t), 0);
}

/** Daily totals for a given local year/month (0-indexed month), index 0 = the 1st. */
export function calendarDailyTotals(transactions: Transaction[], year: number, month: number): number[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totals = new Array(daysInMonth).fill(0) as number[];
  for (const txn of transactions) {
    if (!isExpense(txn)) continue;
    const date = new Date(txn.txn_at);
    if (date.getFullYear() === year && date.getMonth() === month) {
      totals[date.getDate() - 1] += spendAmount(txn);
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

/** Sentinel category label for uncategorized expenses shown alongside real categories (e.g. in a
 * pie chart's breakdown) -- lets a chart's slices/rows tally to its displayed total instead of
 * silently omitting whatever hasn't been categorized yet. */
export const UNCATEGORIZED_LABEL = "Uncategorized";

export function todayRangeTransactions(transactions: Transaction[], now: Date = new Date()): Transaction[] {
  return transactions.filter((t) => isExpense(t) && isSameLocalDay(new Date(t.txn_at), now));
}

export function categoryTransactions(transactions: Transaction[], category: string): Transaction[] {
  const matches = category === UNCATEGORIZED_LABEL ? uncategorized(transactions) : transactions.filter((t) => isExpense(t) && t.category === category);
  return matches.sort((a, b) => new Date(b.txn_at).getTime() - new Date(a.txn_at).getTime());
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

/** Sibling to currentMonthTransactions -- the calendar month immediately before `now`'s. */
export function previousMonthTransactions(transactions: Transaction[], now: Date = new Date()): Transaction[] {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return transactions.filter((t) => {
    const date = new Date(t.txn_at);
    return date.getFullYear() === prev.getFullYear() && date.getMonth() === prev.getMonth();
  });
}

/** Daily expense totals for each day in [start, end] inclusive, ordered oldest to newest --
 * generalizes calendarDailyTotals to a window that can span a month boundary (e.g. a trailing
 * 14-day sparkline), since that one is locked to a single calendar month. */
export function dailyTotalsForRange(transactions: Transaction[], start: Date, end: Date): number[] {
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const dayCount = Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
  const totals = new Array(dayCount).fill(0) as number[];
  for (const txn of transactions) {
    if (!isExpense(txn)) continue;
    const date = new Date(txn.txn_at);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const idx = Math.round((day.getTime() - startDay.getTime()) / 86400000);
    if (idx >= 0 && idx < dayCount) totals[idx] += spendAmount(txn);
  }
  return totals;
}

export interface RecurringCharge {
  merchant: string;
  amount: number;
  nextDue: Date;
}

/** Heuristic, not real subscription/billing data: flags a merchant as recurring when it appears
 * in 2+ distinct months with amounts within ~10% of each other, and estimates the next charge as
 * roughly 30 days after the most recent occurrence. */
export function deriveRecurring(transactions: Transaction[]): RecurringCharge[] {
  const groups = new Map<string, { display: string; date: Date; amount: number }[]>();
  for (const t of transactions) {
    if (!isExpense(t)) continue;
    const display = t.merchant_clean ?? t.merchant_raw;
    if (!display) continue;
    const key = display.trim().toLowerCase();
    const list = groups.get(key) ?? [];
    list.push({ display, date: new Date(t.txn_at), amount: spendAmount(t) });
    groups.set(key, list);
  }

  const recurring: RecurringCharge[] = [];
  for (const occurrences of groups.values()) {
    const months = new Set(occurrences.map((o) => `${o.date.getFullYear()}-${o.date.getMonth()}`));
    if (months.size < 2) continue;

    const amounts = occurrences.map((o) => o.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)]!;
    const consistent = amounts.every((a) => Math.abs(a - median) <= median * 0.1);
    if (!consistent) continue;

    const latest = occurrences.reduce((a, b) => (b.date > a.date ? b : a));
    const nextDue = new Date(latest.date);
    nextDue.setDate(nextDue.getDate() + 30);
    recurring.push({ merchant: latest.display, amount: median, nextDue });
  }

  return recurring.sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());
}

/** "2h ago" / "3d ago" style relative-time label for the sidebar's linked-account list. */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Up to 2 uppercase initials from a display name, "?" when there isn't one. */
export function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.split(" ").filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]!.toUpperCase()).join("");
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
/** Built-in category names plus any custom ones the user added, in that order. Credit
 * transactions (money in) get their own fixed taxonomy instead -- custom categories aren't merged
 * in for "credit" since there's no direction concept in Settings' Manage Categories UI yet. */
export function allCategories(
  customCategories: CustomCategory[],
  direction: "debit" | "credit" = "debit",
): string[] {
  if (direction === "credit") return [...CREDIT_CATEGORIES];
  return [...CATEGORIES, ...customCategories.map((c) => c.name)];
}

/** Built-in subcategory defaults for `category` (if any) plus the user's custom subcategories
 * for it, skipping any custom name that case-insensitively duplicates a built-in default. */
export function mergedSubcategories(category: string, customSubcategories: CustomSubcategory[]): string[] {
  const base = subcategoriesFor(category) ?? [];
  const baseLower = new Set(base.map((s) => s.toLowerCase()));
  const extra = customSubcategories
    .filter((s) => s.category === category && !baseLower.has(s.name.toLowerCase()))
    .map((s) => s.name);
  return [...base, ...extra];
}

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
