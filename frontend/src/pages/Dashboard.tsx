import React, { useEffect, useState, useMemo } from 'react';
import MainLayout from '../components/MainLayout';
import OnboardingWizard from '../components/OnboardingWizard';
import ExpenseFormModal from '../components/ExpenseFormModal';
import CategoryDetailModal from '../components/CategoryDetailModal';
import BudgetEditorModal from '../components/BudgetEditorModal';
import IncomeModal from '../components/IncomeModal';
import SpendingModal from '../components/SpendingModal';
import CategoryRow from '../components/CategoryRow';
import type { ExpenseDraft } from '../components/ExpenseStep';
import {
  getAllocations,
  getTransactions,
  getCategories,
  getIncome,
  createTransaction,
  createCategory,
  saveIncome,
} from '../services/api';
import {
  BudgetAllocationView,
  Transaction,
  Category,
  CategorySummary,
  TransactionPayload,
  IncomeSource,
} from '../types';
import { convertToMonthly, roundToCent, type Frequency } from '../utils/budgetMath';

interface DashboardProps {
  token: string;
  onLogout: () => void;
  requireOnboarding: boolean;
  onOnboardingComplete: () => void;
}

/** Preset category names offered by the budget editor's dropdown. */
const PRESET_CATEGORIES = ['Rent', 'Groceries', 'Utilities', 'Transport', 'Entertainment'];

const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const Dashboard: React.FC<DashboardProps> = ({
  token,
  onLogout,
  requireOnboarding,
  onOnboardingComplete,
}) => {
  const [allocations, setAllocations] = useState<BudgetAllocationView[]>([]);
  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isBudgetEditorOpen, setIsBudgetEditorOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isSpendingModalOpen, setIsSpendingModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [detailCategoryName, setDetailCategoryName] = useState<string | null>(null);
  const [expenseInitialCategoryId, setExpenseInitialCategoryId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [allocs, txns, cats, inc] = await Promise.all([
        getAllocations(),
        getTransactions(),
        getCategories(),
        getIncome(),
      ]);
      setAllocations(allocs);
      setTransactions(txns);
      setCategories(cats);
      setIncome(inc);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load data. Please try refreshing the page.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExpense = async (payload: TransactionPayload) => {
    const newTransaction = await createTransaction(payload);
    // Update local state immediately for instant feedback
    setTransactions((prev) => [...prev, newTransaction]);
    setIsExpenseModalOpen(false);
    setExpenseInitialCategoryId(null);
  };

  const handleCreateCategory = async (name: string): Promise<Category> => {
    const newCategory = await createCategory(name);
    setCategories((prev) => [...prev, newCategory]);
    return newCategory;
  };

  const handleSaveIncome = async (sources: IncomeSource[]) => {
    await saveIncome(sources);
    setIncome(sources);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (requireOnboarding) {
      setIsOnboardingOpen(true);
    }
  }, [requireOnboarding]);

  // Only this month's transactions count toward the tracker
  const monthKey = currentMonthKey();
  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.date.startsWith(monthKey)),
    [transactions, monthKey]
  );

  // Category rows come from budget allocations ONLY — tracking an expense
  // never creates a new category tab.
  // Savings is pinned first; the rest keep their allocation order.
  const categorySummaries = useMemo((): CategorySummary[] => {
    const ordered = [...allocations].sort((a, b) => {
      const aSavings = a.category_name === 'Savings' ? 0 : 1;
      const bSavings = b.category_name === 'Savings' ? 0 : 1;
      return aSavings - bSavings;
    });
    return ordered.map((alloc) => {
      const spent = monthTransactions
        .filter((t) => t.category_id === alloc.category_id || t.category_name === alloc.category_name)
        .reduce((sum, t) => sum + t.amount, 0);

      const remaining = alloc.max_budget - spent;
      return {
        category_id: alloc.category_id,
        category_name: alloc.category_name,
        max_budget: roundToCent(alloc.max_budget),
        percentage: roundToCent(alloc.percentage),
        spent: roundToCent(spent),
        remaining: roundToCent(remaining),
        progress_percent: alloc.max_budget > 0 ? roundToCent((spent / alloc.max_budget) * 100) : 0,
      };
    });
  }, [allocations, monthTransactions]);

  // Real income from saved sources; fall back to the budget total for
  // accounts created before income was persisted.
  const totalIncome = useMemo(() => {
    if (income.length > 0) {
      return roundToCent(
        income.reduce((sum, s) => sum + convertToMonthly(s.amount, s.frequency as Frequency), 0)
      );
    }
    return roundToCent(allocations.reduce((sum, a) => sum + a.max_budget, 0));
  }, [income, allocations]);

  const totalSpending = useMemo(
    () => roundToCent(monthTransactions.reduce((sum, t) => sum + t.amount, 0)),
    [monthTransactions]
  );

  const totalRemaining = roundToCent(totalIncome - totalSpending);

  // Prefill for the budget editor: current allocations minus the automatic
  // Savings envelope (leftover income becomes Savings again on save).
  const budgetEditorItems = useMemo((): ExpenseDraft[] => {
    return allocations
      .filter((a) => a.category_name !== 'Savings')
      .map((a, i) => ({
        id: Date.now() + i,
        category: PRESET_CATEGORIES.includes(a.category_name) ? a.category_name : 'Custom',
        customCategory: PRESET_CATEGORIES.includes(a.category_name) ? '' : a.category_name,
        percentage: a.percentage,
        amount: a.max_budget,
        frequency: 'Monthly' as const,
      }));
  }, [allocations]);

  const username = localStorage.getItem('username') || 'User';

  if (requireOnboarding) {
    return (
      <div className="min-h-screen bg-gray-50">
        <OnboardingWizard
          isOpen={true}
          onClose={() => undefined}
          onCompleted={onOnboardingComplete}
          allowClose={false}
        />
      </div>
    );
  }

  return (
    <MainLayout username={username} onLogout={onLogout}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {/* Global Metrics */}
        {loading ? (
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="mb-3 h-4 w-1/2 rounded bg-gray-200"></div>
                <div className="h-8 w-3/4 rounded bg-gray-200"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Total Monthly Income — click to edit income streams */}
            <button
              type="button"
              onClick={() => setIsIncomeModalOpen(true)}
              className="card card-hover cursor-pointer text-left"
              title="Click to edit your income"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-600">Total Monthly Income</p>
                  <p className="text-3xl font-bold text-budget-income">
                    ${totalIncome.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Click to edit income</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Total Monthly Spending — click for the breakdown pie */}
            <button
              type="button"
              onClick={() => setIsSpendingModalOpen(true)}
              className="card card-hover cursor-pointer text-left"
              title="Click to see where your money went"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-600">Total Monthly Spending</p>
                  <p className="text-3xl font-bold text-budget-expense">
                    ${totalSpending.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Click for breakdown</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                  <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Total Remaining Balance */}
            <div className="card card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-600">Remaining Balance</p>
                  <p
                    className={`text-3xl font-bold ${
                      totalRemaining >= 0 ? 'text-budget-income' : 'text-budget-expense'
                    }`}
                  >
                    ${totalRemaining.toFixed(2)}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                  <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Budget editor button */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Your Budget Categories</h2>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-gray-800"
            onClick={() => setIsBudgetEditorOpen(true)}
          >
            <span className="text-xl leading-none">+</span> Add Expense
          </button>
        </div>

        {/* Category Summary Rows */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="mb-2 h-4 w-1/4 rounded bg-gray-200"></div>
                <div className="h-3 w-full rounded bg-gray-200"></div>
              </div>
            ))}
          </div>
        ) : categorySummaries.length === 0 ? (
          <div className="card text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No budget categories yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Complete the onboarding wizard to set up your budget.
            </p>
            <button
              type="button"
              onClick={() => setIsOnboardingOpen(true)}
              className="mt-4 btn btn-primary"
            >
              Start Onboarding
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {categorySummaries.map((category) => (
              <CategoryRow
                key={category.category_id}
                categoryName={category.category_name}
                spent={category.spent}
                maxBudget={category.max_budget}
                percentage={category.percentage}
                onClick={() => setDetailCategoryName(category.category_name)}
              />
            ))}
          </div>
        )}

        {/* Onboarding Wizard — first-time setup only */}
        {isOnboardingOpen && (
          <OnboardingWizard
            isOpen={true}
            onClose={() => setIsOnboardingOpen(false)}
            onCompleted={() => {
              onOnboardingComplete();
              setIsOnboardingOpen(false);
              loadData();
            }}
            allowClose={!requireOnboarding}
          />
        )}

        {/* Budget editor — edit this month's allocations */}
        <BudgetEditorModal
          isOpen={isBudgetEditorOpen}
          totalMonthlyIncome={totalIncome}
          initialItems={budgetEditorItems}
          onSaved={loadData}
          onClose={() => setIsBudgetEditorOpen(false)}
        />

        {/* Income editor */}
        <IncomeModal
          isOpen={isIncomeModalOpen}
          sources={income}
          onSave={handleSaveIncome}
          onClose={() => setIsIncomeModalOpen(false)}
        />

        {/* Spending breakdown */}
        <SpendingModal
          isOpen={isSpendingModalOpen}
          transactions={monthTransactions}
          periodLabel={new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          onClose={() => setIsSpendingModalOpen(false)}
        />

        {/* Category breakdown focus window */}
        {detailCategoryName && (() => {
          const summary = categorySummaries.find((c) => c.category_name === detailCategoryName);
          const categoryTransactions = monthTransactions.filter(
            (t) =>
              t.category_name === detailCategoryName ||
              categories.find((c) => c.id === t.category_id)?.name === detailCategoryName
          );
          return (
            <CategoryDetailModal
              isOpen={true}
              categoryName={detailCategoryName}
              maxBudget={summary?.max_budget ?? 0}
              spent={summary?.spent ?? 0}
              transactions={categoryTransactions}
              onTrackExpense={() => {
                const cat = categories.find((c) => c.name === detailCategoryName);
                setExpenseInitialCategoryId(cat ? cat.id : null);
                setIsExpenseModalOpen(true);
              }}
              onSetBudget={() => {
                setDetailCategoryName(null);
                setIsBudgetEditorOpen(true);
              }}
              onClose={() => setDetailCategoryName(null)}
            />
          );
        })()}

        {/* Expense tracker form (from a category's Track Expense button) */}
        <ExpenseFormModal
          isOpen={isExpenseModalOpen}
          categories={categories}
          categorySummaries={categorySummaries}
          initialCategoryId={expenseInitialCategoryId}
          onSave={handleSaveExpense}
          onCreateCategory={handleCreateCategory}
          onCancel={() => {
            setIsExpenseModalOpen(false);
            setExpenseInitialCategoryId(null);
          }}
        />
      </div>
    </MainLayout>
  );
};

export default Dashboard;
