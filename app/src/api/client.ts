const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// Single-user MVP: there's no login screen yet, so every call is scoped to this fixed user.
export const CURRENT_USER_ID = 1;

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

export function buildAuthUrl(provider: Provider, redirectUri: string, userId: number = CURRENT_USER_ID): string {
  const params = new URLSearchParams({ user_id: String(userId), return_to: redirectUri });
  return `${API_BASE_URL}/auth/${provider}?${params.toString()}`;
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

export async function updateTransactionCategory(transactionId: number, category: string): Promise<Transaction> {
  const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/category`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update category (${response.status})`);
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
