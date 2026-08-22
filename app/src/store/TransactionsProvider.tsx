import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  type AppUser,
  type Budget,
  type CustomCategory,
  type CustomSubcategory,
  type EmailAccount,
  type Frequency,
  type SavingsGoal,
  type Subscription,
  type Summary,
  type Transaction,
  type TransactionDraft,
  CURRENT_USER_ID,
  createCategory,
  createSubcategory,
  createSubscription,
  createTransaction,
  deleteCategory,
  deleteEmailAccount,
  deleteSubcategory,
  deleteSubscription,
  deleteTransaction,
  getBudget,
  getCategories,
  getGoal,
  getLinkedAccounts,
  getSubscriptions,
  getSummary,
  getTransactions,
  getUser,
  syncTransactions,
  updateBudget as apiUpdateBudget,
  updateGoal as apiUpdateGoal,
  updateTransactionCategory,
  updateTransactionDetails,
  updateUserName as apiUpdateUserName,
} from "../api/client";

interface AppDataState {
  transactions: Transaction[];
  summary: Summary | null;
  budget: Budget | null;
  goal: SavingsGoal | null;
  user: AppUser | null;
  accounts: EmailAccount[];
  customCategories: CustomCategory[];
  customSubcategories: CustomSubcategory[];
  subscriptions: Subscription[];
  loading: boolean;
  error: string | null;
}

interface AppDataActions {
  refetch: () => Promise<void>;
  categorize: (id: number, category: string, subcategory?: string | null, country?: string | null) => Promise<void>;
  addTransaction: (draft: TransactionDraft) => Promise<void>;
  editTransaction: (id: number, merchant: string, amount: string, country?: string | null) => Promise<void>;
  removeTransaction: (id: number) => Promise<void>;
  updateBudget: (monthlyTarget: string) => Promise<void>;
  updateGoal: (goal: { name: string; target_amount: string; saved_amount: string }) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  removeAccount: (accountId: number) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  removeCategory: (categoryId: number) => Promise<void>;
  addSubcategory: (category: string, name: string) => Promise<void>;
  removeSubcategory: (subcategoryId: number) => Promise<void>;
  addSubscription: (name: string, amount: string, frequency: Frequency, nextDue: string) => Promise<void>;
  removeSubscription: (subscriptionId: number) => Promise<void>;
}

type AppDataContextValue = AppDataState & AppDataActions;

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error("useAppData must be used within a TransactionsProvider");
  }
  return ctx;
}

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppDataState>({
    transactions: [],
    summary: null,
    budget: null,
    goal: null,
    user: null,
    accounts: [],
    customCategories: [],
    customSubcategories: [],
    subscriptions: [],
    loading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    try {
      setState((s) => ({ ...s, error: null }));
      const [transactions, summary, budget, goal, user, accounts, categoriesData, subscriptions] = await Promise.all([
        getTransactions(),
        getSummary(),
        getBudget(),
        getGoal(),
        getUser(),
        getLinkedAccounts(),
        getCategories(),
        getSubscriptions(),
      ]);
      setState((s) => ({
        ...s,
        transactions,
        summary,
        budget,
        goal,
        user,
        accounts,
        customCategories: categoriesData.categories,
        customSubcategories: categoriesData.subcategories,
        subscriptions,
        loading: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load data",
      }));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Catch up on mail since the last successful sync before loading data -- the backend's
        // free-tier host sleeps after inactivity, so the 10-minute background scheduler may not
        // have run in a while; this makes "open the app" itself trigger a fresh read instead of
        // showing however-stale data happened to already be in the database. Best-effort: a cold
        // start, a network hiccup, or one account's expired token must never block the app from
        // showing whatever's already stored.
        await syncTransactions(CURRENT_USER_ID);
      } catch {
        // swallow -- refetch() below still runs regardless
      }
      await refetch();
    })();
  }, [refetch]);

  const categorize = useCallback(
    async (id: number, category: string, subcategory: string | null = null, country: string | null = null) => {
      const updated = await updateTransactionCategory(id, category, subcategory, country);
      setState((s) => ({
        ...s,
        transactions: s.transactions.map((t) => (t.id === updated.id ? updated : t)),
      }));
      const summary = await getSummary();
      setState((s) => ({ ...s, summary }));
    },
    [],
  );

  const addTransaction = useCallback(async (draft: TransactionDraft) => {
    const created = await createTransaction(draft);
    setState((s) => ({
      ...s,
      // Insert in txn_at-desc order (matching GET /transactions' own ORDER BY) rather than a
      // naive prepend -- a backdated manual entry must land in its correct chronological slot,
      // not always jump to the top. Every consumer of this array (Activity's groupByDay,
      // QuickSort's queue) assumes it's already sorted this way and doesn't re-sort itself.
      transactions: [created, ...s.transactions].sort(
        (a, b) => new Date(b.txn_at).getTime() - new Date(a.txn_at).getTime(),
      ),
    }));
    const summary = await getSummary();
    setState((s) => ({ ...s, summary }));
  }, []);

  const editTransaction = useCallback(async (id: number, merchant: string, amount: string, country?: string | null) => {
    const updated = await updateTransactionDetails(id, merchant, amount, undefined, country);
    setState((s) => ({
      ...s,
      transactions: s.transactions.map((t) => (t.id === updated.id ? updated : t)),
    }));
    const summary = await getSummary();
    setState((s) => ({ ...s, summary }));
  }, []);

  const removeTransaction = useCallback(async (id: number) => {
    await deleteTransaction(id);
    setState((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== id) }));
    const summary = await getSummary();
    setState((s) => ({ ...s, summary }));
  }, []);

  const updateBudgetAction = useCallback(async (monthlyTarget: string) => {
    const budget = await apiUpdateBudget(monthlyTarget);
    setState((s) => ({ ...s, budget }));
  }, []);

  const updateGoalAction = useCallback(
    async (goalInput: { name: string; target_amount: string; saved_amount: string }) => {
      const goal = await apiUpdateGoal(goalInput);
      setState((s) => ({ ...s, goal }));
    },
    [],
  );

  const updateName = useCallback(async (name: string) => {
    const user = await apiUpdateUserName(name);
    setState((s) => ({ ...s, user }));
  }, []);

  const removeAccount = useCallback(
    async (accountId: number) => {
      await deleteEmailAccount(accountId);
      // Unlinking cascade-deletes every transaction synced from this account server-side. The
      // frontend has no client-side signal for which entries in `transactions` those were, so
      // refetch the authoritative post-delete state rather than trying to guess locally.
      await refetch();
    },
    [refetch],
  );

  const addCategory = useCallback(async (name: string) => {
    const category = await createCategory(name);
    setState((s) => ({ ...s, customCategories: [...s.customCategories, category] }));
  }, []);

  const removeCategory = useCallback(async (categoryId: number) => {
    await deleteCategory(categoryId);
    setState((s) => ({ ...s, customCategories: s.customCategories.filter((c) => c.id !== categoryId) }));
  }, []);

  const addSubcategory = useCallback(async (category: string, name: string) => {
    const subcategory = await createSubcategory(category, name);
    setState((s) => ({ ...s, customSubcategories: [...s.customSubcategories, subcategory] }));
  }, []);

  const removeSubcategory = useCallback(async (subcategoryId: number) => {
    await deleteSubcategory(subcategoryId);
    setState((s) => ({
      ...s,
      customSubcategories: s.customSubcategories.filter((sc) => sc.id !== subcategoryId),
    }));
  }, []);

  const addSubscription = useCallback(async (name: string, amount: string, frequency: Frequency, nextDue: string) => {
    const subscription = await createSubscription(name, amount, frequency, nextDue);
    setState((s) => ({ ...s, subscriptions: [...s.subscriptions, subscription] }));
  }, []);

  const removeSubscription = useCallback(async (subscriptionId: number) => {
    await deleteSubscription(subscriptionId);
    setState((s) => ({
      ...s,
      subscriptions: s.subscriptions.filter((sub) => sub.id !== subscriptionId),
    }));
  }, []);

  const value = useMemo<AppDataContextValue>(
    () => ({
      ...state,
      refetch,
      categorize,
      addTransaction,
      editTransaction,
      removeTransaction,
      updateBudget: updateBudgetAction,
      updateGoal: updateGoalAction,
      updateName,
      removeAccount,
      addCategory,
      removeCategory,
      addSubcategory,
      removeSubcategory,
      addSubscription,
      removeSubscription,
    }),
    [
      state,
      refetch,
      categorize,
      addTransaction,
      editTransaction,
      removeTransaction,
      updateBudgetAction,
      updateGoalAction,
      updateName,
      removeAccount,
      addCategory,
      removeCategory,
      addSubcategory,
      removeSubcategory,
      addSubscription,
      removeSubscription,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
