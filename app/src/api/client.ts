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
