const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// One device is logged into one user at a time. Starts at 1 so every screen-level test (which
// renders a screen directly, bypassing AuthProvider entirely) keeps working unchanged; the real
// app overwrites this via setCurrentUserId once AuthProvider resolves who's actually logged in.
export let CURRENT_USER_ID = 1;

export function setCurrentUserId(id: number): void {
  CURRENT_USER_ID = id;
}

// Thrown on a non-ok HTTP response (as opposed to a plain network/timeout failure, which throws a
// bare Error/TypeError from fetch itself) -- lets callers tell "the server responded and said no"
// apart from "the request never got a response at all" (e.g. a Render cold start).
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Provider = "google" | "microsoft";

export interface EmailAccount {
  id: number;
  provider: Provider;
  provider_email: string;
  last_synced_at: string | null;
  created_at: string;
}

export async function getLinkedAccounts(userId: number = CURRENT_USER_ID): Promise<EmailAccount[]> {
  const response = await fetch(`${API_BASE_URL}/email-accounts?user_id=${userId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch linked accounts (${response.status})`);
  }
  return response.json();
}

export function buildAuthUrl(provider: Provider, redirectUri: string, userId?: number): string {
  // No userId -> the login/signup flow: connecting the account is what resolves/creates the
  // user, so there's deliberately nothing to identify one by yet.
  const params = new URLSearchParams({ return_to: redirectUri });
  if (userId !== undefined) {
    params.set("user_id", String(userId));
  }
  return `${API_BASE_URL}/auth/${provider}?${params.toString()}`;
}

export interface SyncResult {
  user_id: number;
  inserted: number;
  accounts: { provider: Provider; provider_email: string; inserted: number }[];
}

export async function syncTransactions(userId: number, since?: string): Promise<SyncResult> {
  const params = new URLSearchParams({ user_id: String(userId) });
  if (since !== undefined) {
    params.set("since", since);
  }
  const response = await fetch(`${API_BASE_URL}/sync?${params.toString()}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to sync transactions (${response.status})`);
  }
  return response.json();
}

export async function deleteEmailAccount(accountId: number, userId: number = CURRENT_USER_ID): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/email-accounts/${accountId}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to unlink account (${response.status})`);
  }
}

export interface Transaction {
  id: number;
  user_id: number;
  source_email_id: string;
  provider: Provider | null;
  amount: string;
  currency: string;
  // SGD-equivalent of `amount`, computed server-side from that month's average exchange rate --
  // equals `amount` when currency is already "SGD"; null if a foreign-currency row's rate lookup
  // failed. Use this (falling back to `amount`) for any total/aggregate; `amount`+`currency` stay
  // the original foreign figure for per-transaction display.
  amount_sgd: string | null;
  direction: "debit" | "credit";
  merchant_raw: string | null;
  merchant_clean: string | null;
  category: string | null;
  subcategory: string | null;
  txn_at: string;
  bank: string | null;
  country: string | null;
  raw_parsed: Record<string, unknown> | null;
  created_at: string;
}

export async function getTransactions(
  direction?: "debit" | "credit",
  userId: number = CURRENT_USER_ID,
): Promise<Transaction[]> {
  const params = new URLSearchParams({ user_id: String(userId) });
  if (direction) params.set("direction", direction);
  const response = await fetch(`${API_BASE_URL}/transactions?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch transactions (${response.status})`);
  }
  return response.json();
}

export async function updateTransactionCategory(
  transactionId: number,
  category: string,
  subcategory: string | null = null,
  country: string | null = null,
): Promise<Transaction> {
  const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/category`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, subcategory, country }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update category (${response.status})`);
  }
  return response.json();
}

export async function updateTransactionDetails(
  transactionId: number,
  merchant: string,
  amount: string,
  userId: number = CURRENT_USER_ID,
  country?: string | null,
): Promise<Transaction> {
  const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/details?user_id=${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchant, amount, country: country ?? null }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update transaction (${response.status})`);
  }
  return response.json();
}

export async function deleteTransaction(transactionId: number, userId: number = CURRENT_USER_ID): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete transaction (${response.status})`);
  }
}

export interface CategorizePendingResult {
  categorized: number;
  remaining: number;
}

export async function categorizePending(userId: number = CURRENT_USER_ID): Promise<CategorizePendingResult> {
  const response = await fetch(`${API_BASE_URL}/transactions/categorize-pending?user_id=${userId}`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to auto-categorize transactions (${response.status})`);
  }
  return response.json();
}

export interface TransactionDraft {
  user_id: number;
  amount: string;
  currency?: string;
  direction?: "debit" | "credit";
  merchant_raw?: string | null;
  merchant_clean?: string | null;
  category: string;
  subcategory?: string | null;
  txn_at: string;
  bank?: string | null;
  country?: string | null;
}

export async function createTransaction(draft: TransactionDraft): Promise<Transaction> {
  const response = await fetch(`${API_BASE_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!response.ok) {
    throw new Error(`Failed to add transaction (${response.status})`);
  }
  return response.json();
}

export interface CategorySummary {
  category: string | null;
  total: string;
}

export interface Summary {
  user_id: number;
  month: string;
  categories: CategorySummary[];
  total: string;
}

export async function getSummary(userId: number = CURRENT_USER_ID): Promise<Summary> {
  const response = await fetch(`${API_BASE_URL}/summary?user_id=${userId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch summary (${response.status})`);
  }
  return response.json();
}

export interface Budget {
  user_id: number;
  monthly_target: string;
  weekly_target: string;
  daily_target: string;
}

export async function getBudget(userId: number = CURRENT_USER_ID): Promise<Budget> {
  const response = await fetch(`${API_BASE_URL}/budget?user_id=${userId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch budget (${response.status})`);
  }
  return response.json();
}

export async function updateBudget(monthlyTarget: string, userId: number = CURRENT_USER_ID): Promise<Budget> {
  const response = await fetch(`${API_BASE_URL}/budget?user_id=${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthly_target: monthlyTarget }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update budget (${response.status})`);
  }
  return response.json();
}

export interface CategoryBudget {
  category: string;
  monthly_limit: string;
}

export async function getCategoryBudgets(userId: number = CURRENT_USER_ID): Promise<CategoryBudget[]> {
  const response = await fetch(`${API_BASE_URL}/category-budgets?user_id=${userId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch category budgets (${response.status})`);
  }
  return response.json();
}

export async function updateCategoryBudget(
  category: string,
  monthlyLimit: string,
  userId: number = CURRENT_USER_ID,
): Promise<CategoryBudget> {
  const response = await fetch(`${API_BASE_URL}/category-budgets/${encodeURIComponent(category)}?user_id=${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthly_limit: monthlyLimit }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update category budget (${response.status})`);
  }
  return response.json();
}

export async function deleteCategoryBudget(category: string, userId: number = CURRENT_USER_ID): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/category-budgets/${encodeURIComponent(category)}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete category budget (${response.status})`);
  }
}

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface Subscription {
  id: number;
  name: string;
  amount: string;
  frequency: Frequency;
  next_due: string;
}

export async function getSubscriptions(userId: number = CURRENT_USER_ID): Promise<Subscription[]> {
  const response = await fetch(`${API_BASE_URL}/subscriptions?user_id=${userId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch subscriptions (${response.status})`);
  }
  return response.json();
}

export async function createSubscription(
  name: string,
  amount: string,
  frequency: Frequency,
  nextDue: string,
  userId: number = CURRENT_USER_ID,
): Promise<Subscription> {
  const response = await fetch(`${API_BASE_URL}/subscriptions?user_id=${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, amount, frequency, next_due: nextDue }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create subscription (${response.status})`);
  }
  return response.json();
}

export async function updateSubscription(
  subscriptionId: number,
  name: string,
  amount: string,
  frequency: Frequency,
  nextDue: string,
  userId: number = CURRENT_USER_ID,
): Promise<Subscription> {
  const response = await fetch(`${API_BASE_URL}/subscriptions/${subscriptionId}?user_id=${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, amount, frequency, next_due: nextDue }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update subscription (${response.status})`);
  }
  return response.json();
}

export async function deleteSubscription(subscriptionId: number, userId: number = CURRENT_USER_ID): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/subscriptions/${subscriptionId}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete subscription (${response.status})`);
  }
}

export interface SavingsGoal {
  user_id: number;
  name: string;
  target_amount: string;
  saved_amount: string;
}

export async function getGoal(userId: number = CURRENT_USER_ID): Promise<SavingsGoal> {
  const response = await fetch(`${API_BASE_URL}/goal?user_id=${userId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch goal (${response.status})`);
  }
  return response.json();
}

export async function updateGoal(
  goal: { name: string; target_amount: string; saved_amount: string },
  userId: number = CURRENT_USER_ID,
): Promise<SavingsGoal> {
  const response = await fetch(`${API_BASE_URL}/goal?user_id=${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(goal),
  });
  if (!response.ok) {
    throw new Error(`Failed to update goal (${response.status})`);
  }
  return response.json();
}

export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
}

export async function getUser(userId: number = CURRENT_USER_ID): Promise<AppUser> {
  const response = await fetch(`${API_BASE_URL}/user?user_id=${userId}`);
  if (!response.ok) {
    throw new ApiError(`Failed to fetch user (${response.status})`, response.status);
  }
  return response.json();
}

export async function registerAccount(email: string, password: string, name?: string): Promise<AppUser> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: name ?? null }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.detail ?? `Failed to register (${response.status})`, response.status);
  }
  return response.json();
}

export async function loginWithPassword(email: string, password: string): Promise<AppUser> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.detail ?? `Failed to log in (${response.status})`, response.status);
  }
  return response.json();
}

export async function updateUserName(name: string, userId: number = CURRENT_USER_ID): Promise<AppUser> {
  const response = await fetch(`${API_BASE_URL}/user?user_id=${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update name (${response.status})`);
  }
  return response.json();
}

export interface CustomCategory {
  id: number;
  name: string;
}

export interface CustomSubcategory {
  id: number;
  category: string;
  name: string;
}

export interface CustomCategories {
  categories: CustomCategory[];
  subcategories: CustomSubcategory[];
}

export async function getCategories(userId: number = CURRENT_USER_ID): Promise<CustomCategories> {
  const response = await fetch(`${API_BASE_URL}/categories?user_id=${userId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch categories (${response.status})`);
  }
  return response.json();
}

export async function createCategory(name: string, userId: number = CURRENT_USER_ID): Promise<CustomCategory> {
  const response = await fetch(`${API_BASE_URL}/categories?user_id=${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(`Failed to add category (${response.status})`);
  }
  return response.json();
}

export async function deleteCategory(categoryId: number, userId: number = CURRENT_USER_ID): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/categories/${categoryId}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to remove category (${response.status})`);
  }
}

export async function createSubcategory(
  category: string,
  name: string,
  userId: number = CURRENT_USER_ID,
): Promise<CustomSubcategory> {
  const response = await fetch(
    `${API_BASE_URL}/categories/${encodeURIComponent(category)}/subcategories?user_id=${userId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to add subcategory (${response.status})`);
  }
  return response.json();
}

export async function deleteSubcategory(subcategoryId: number, userId: number = CURRENT_USER_ID): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/subcategories/${subcategoryId}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to remove subcategory (${response.status})`);
  }
}
