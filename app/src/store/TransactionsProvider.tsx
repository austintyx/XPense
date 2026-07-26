import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  type AppUser,
  type Budget,
  type CustomCategory,
  type CustomSubcategory,
  type EmailAccount,
  type SavingsGoal,
  type Summary,
  type Transaction,
  type TransactionDraft,
  createCategory,
  createSubcategory,
  createTransaction,
  deleteCategory,
  deleteEmailAccount,
  deleteSubcategory,
  getBudget,
  getCategories,
  getGoal,
  getLinkedAccounts,
  getSummary,
  getTransactions,
  getUser,
  updateBudget as apiUpdateBudget,
  updateGoal as apiUpdateGoal,
  updateTransactionCategory,
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
  loading: boolean;
  error: string | null;
}

interface AppDataActions {
  refetch: () => Promise<void>;
  categorize: (id: number, category: string, subcategory?: string | null) => Promise<void>;
  addTransaction: (draft: TransactionDraft) => Promise<void>;
  updateBudget: (monthlyTarget: string) => Promise<void>;
  updateGoal: (goal: { name: string; target_amount: string; saved_amount: string }) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  removeAccount: (accountId: number) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
  removeCategory: (categoryId: number) => Promise<void>;
  addSubcategory: (category: string, name: string) => Promise<void>;
  removeSubcategory: (subcategoryId: number) => Promise<void>;
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
    loading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    try {
      setState((s) => ({ ...s, error: null }));
      const [transactions, summary, budget, goal, user, accounts, categoriesData] = await Promise.all([
        getTransactions(),
        getSummary(),
        getBudget(),
        getGoal(),
        getUser(),
        getLinkedAccounts(),
        getCategories(),
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
    refetch();
  }, [refetch]);

  const categorize = useCallback(
    async (id: number, category: string, subcategory: string | null = null) => {
      const updated = await updateTransactionCategory(id, category, subcategory);
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
    setState((s) => ({ ...s, transactions: [created, ...s.transactions] }));
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

  const removeAccount = useCallback(async (accountId: number) => {
    await deleteEmailAccount(accountId);
    setState((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== accountId) }));
  }, []);

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

  const value = useMemo<AppDataContextValue>(
    () => ({
      ...state,
      refetch,
      categorize,
      addTransaction,
      updateBudget: updateBudgetAction,
      updateGoal: updateGoalAction,
      updateName,
      removeAccount,
      addCategory,
      removeCategory,
      addSubcategory,
      removeSubcategory,
    }),
    [
      state,
      refetch,
      categorize,
      addTransaction,
      updateBudgetAction,
      updateGoalAction,
      updateName,
      removeAccount,
      addCategory,
      removeCategory,
      addSubcategory,
      removeSubcategory,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
