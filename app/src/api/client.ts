const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// One device is logged into one user at a time. Starts at 1 so every screen-level test (which
// renders a screen directly, bypassing AuthProvider entirely) keeps working unchanged; the real
// app overwrites this via setCurrentUserId once AuthProvider resolves who's actually logged in.
export let CURRENT_USER_ID = 1;

export function setCurrentUserId(id: number): void {
  CURRENT_USER_ID = id;
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

export async function deleteEmailAccount(accountId: number, userId: number = CURRENT_USER_ID): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/email-accounts/${accountId}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to unlink account (${response.status})`);
  }
}

export type TransactionType = "expense" | "transfer" | "income";

export interface Transaction {
  id: number;
  user_id: number;
  source_email_id: string;
  provider: Provider | null;
  amount: string;
  currency: string;
  direction: "debit" | "credit";
  type: TransactionType;
  merchant_raw: string | null;
  merchant_clean: string | null;
  category: string | null;
  subcategory: string | null;
  txn_at: string;
  bank: string | null;
  raw_parsed: Record<string, unknown> | null;
  created_at: string;
}

export async function getTransactions(
  type: TransactionType = "expense",
  userId: number = CURRENT_USER_ID,
): Promise<Transaction[]> {
  const params = new URLSearchParams({ user_id: String(userId), type });
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
): Promise<Transaction> {
  const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/category`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, subcategory }),
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
): Promise<Transaction> {
  const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/details?user_id=${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchant, amount }),
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

export interface TransactionDraft {
  user_id: number;
  amount: string;
  currency?: string;
  direction?: "debit" | "credit";
  type?: TransactionType;
  merchant_raw?: string | null;
  merchant_clean?: string | null;
  category: string;
  subcategory?: string | null;
  txn_at: string;
  bank?: string | null;
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
    throw new Error(`Failed to fetch user (${response.status})`);
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
