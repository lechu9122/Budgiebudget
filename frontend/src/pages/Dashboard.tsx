import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import OnboardingWizard from '../components/OnboardingWizard';
import ExpenseFormModal from '../components/ExpenseFormModal';
import CategoryRow from '../components/CategoryRow';
import { getBudgetItems, getTransactions, getCategories, createTransaction, createCategory } from '../services/api';
import { BudgetItem, Transaction, Category, CategorySummary, TransactionPayload } from '../types';

interface DashboardProps {
  token: string;
  onLogout: () => void;
  requireOnboarding: boolean;
  onOnboardingComplete: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  token,
  onLogout,
  requireOnboarding,
  onOnboardingComplete,
}) => {
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [budgets, txns, cats] = await Promise.all([
        getBudgetItems(),
        getTransactions(),
        getCategories(),
      ]);
      setBudgetItems(budgets);
      setTransactions(txns);
      setCategories(cats);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load data. Please try refreshing the page.';
      setError(errorMessage);
      // If it's an auth error, the interceptor will handle logout
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExpense = async (payload: TransactionPayload) => {
    const newTransaction = await createTransaction(payload);
    // Update local state immediately for instant feedback
    setTransactions((prev) => [...prev, newTransaction]);
    setIsExpenseModalOpen(false);
  };

  const handleCreateCategory = async (name: string): Promise<Category> => {
    const newCategory = await createCategory(name);
    // Update local state immediately
    setCategories((prev) => [...prev, newCategory]);
    return newCategory;
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (requireOnboarding) {
      setIsOnboardingOpen(true);
    }
  }, [requireOnboarding]);

  // Calculate category summaries by grouping expenses by category
  const categorySummaries = useMemo((): CategorySummary[] => {
    // Group budget items by category and sum amounts
    const categoryMap = new Map<string, { total: number; count: number }>();
    
    budgetItems.forEach((item) => {
      const existing = categoryMap.get(item.category) || { total: 0, count: 0 };
      categoryMap.set(item.category, {
        total: existing.total + item.amount,
        count: existing.count + 1,
      });
    });

    // Convert to array and calculate percentages
    const totalBudget = budgetItems.reduce((sum, item) => sum + item.amount, 0);
    
    return Array.from(categoryMap.entries()).map(([categoryName, data], index) => {
      const maxBudget = data.total;
      const percentage = totalBudget > 0 ? (maxBudget / totalBudget) * 100 : 0;
      
      // Calculate spent from transactions with matching category
      const spent = transactions
        .filter((t) => t.category_name === categoryName || (categories.find((c) => c.id === t.category_id)?.name === categoryName))
        .reduce((sum, t) => sum + t.amount, 0);
      
      const remaining = maxBudget - spent;
      const progress_percent = maxBudget > 0 ? (spent / maxBudget) * 100 : 0;

      return {
        category_id: index, // Use index as pseudo-ID
        category_name: categoryName,
        max_budget: Math.round(maxBudget * 100) / 100,
        percentage: Math.round(percentage * 100) / 100,
        spent: Math.round(spent * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        progress_percent: Math.round(progress_percent * 100) / 100,
      };
    });
  }, [budgetItems, transactions, categories]);

  // Calculate global metrics
  const totalIncome = useMemo(() => {
    return budgetItems.reduce((sum, item) => sum + item.amount, 0);
  }, [budgetItems]);

  const totalSpending = useMemo(() => {
    return categorySummaries.reduce((sum, cat) => sum + cat.spent, 0);
  }, [categorySummaries]);

  const totalRemaining = totalIncome - totalSpending;

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
    <MainLayout 
      username={username} 
      onLogout={onLogout}
      onNavigate={(page) => {
        const routes: { [key: string]: string } = {
          'dashboard': '/dashboard',
          'csv-import': '/csv-import',
          'reports': '/reports',
          'profile': '/profile'
        };
        if (routes[page]) {
          navigate(routes[page]);
        }
      }}
    >
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
            {/* Total Monthly Income */}
            <div className="card card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-600">Total Monthly Income</p>
                  <p className="text-3xl font-bold text-budget-income">
                    ${totalIncome.toFixed(2)}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Total Monthly Spending */}
            <div className="card card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-600">Total Monthly Spending</p>
                  <p className="text-3xl font-bold text-budget-expense">
                    ${totalSpending.toFixed(2)}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </div>
              </div>
            </div>

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
                  <svg
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Expense Button */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Your Budget Categories</h2>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-gray-800"
            onClick={() => setIsExpenseModalOpen(true)}
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
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
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
                onClick={() => {
                  // Will open detail modal in Phase 5
                  console.log('Category clicked:', category.category_name);
                }}
              />
            ))}
          </div>
        )}

        {/* Onboarding Wizard */}
        <OnboardingWizard
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          onCompleted={() => {
            onOnboardingComplete();
            loadData();
          }}
          allowClose={!requireOnboarding}
        />

        {/* Expense Form Modal */}
        <ExpenseFormModal
          isOpen={isExpenseModalOpen}
          categories={categories}
          onSave={handleSaveExpense}
          onCreateCategory={handleCreateCategory}
          onCancel={() => setIsExpenseModalOpen(false)}
        />
      </div>
    </MainLayout>
  );
};

export default Dashboard;
