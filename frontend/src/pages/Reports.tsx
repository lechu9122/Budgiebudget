import React, { useState, useEffect } from 'react';
import MainLayout from '../components/MainLayout';
import { getAllocations, getTransactions } from '../services/api';

interface MonthlyMetrics {
  totalIncome: number;
  totalSpent: number;
  netSavings: number;
}

interface CategoryBreakdown {
  category_name: string;
  budgeted: number;
  spent: number;
  percentage: number;
}

interface ReportsProps {
  username: string;
  onLogout: () => void;
  onNavigate: (page: 'dashboard' | 'csv-import' | 'reports' | 'profile') => void;
}

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const Reports: React.FC<ReportsProps> = ({ username, onLogout, onNavigate }) => {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [metrics, setMetrics] = useState<MonthlyMetrics>({
    totalIncome: 0,
    totalSpent: 0,
    netSavings: 0,
  });
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate month options for the past 12 months
  const getMonthOptions = () => {
    const options = [];
    const currentDate = new Date();
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    
    return options;
  };

  useEffect(() => {
    loadReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const [allocations, transactions] = await Promise.all([
        getAllocations(parseInt(monthStr, 10), parseInt(yearStr, 10)),
        getTransactions(),
      ]);

      // Budgeted amounts per category come from that month's budget plan
      // (budget_allocations, set during onboarding / the budget editor).
      const budgeted = new Map<string, number>();
      allocations.forEach((alloc) => {
        budgeted.set(alloc.category_name, (budgeted.get(alloc.category_name) || 0) + alloc.max_budget);
      });
      const totalIncome = allocations.reduce((sum, alloc) => sum + alloc.max_budget, 0);

      // Spending comes from transactions in the selected month.
      const monthTransactions = transactions.filter((t) => t.date.startsWith(selectedMonth));
      const spent = new Map<string, number>();
      monthTransactions.forEach((t) => {
        spent.set(t.category_name, (spent.get(t.category_name) || 0) + t.amount);
      });
      const totalSpent = monthTransactions.reduce((sum, t) => sum + t.amount, 0);

      const categoryNames = new Set([...budgeted.keys(), ...spent.keys()]);
      const breakdown: CategoryBreakdown[] = Array.from(categoryNames)
        .map((name) => {
          const budget = budgeted.get(name) || 0;
          const used = spent.get(name) || 0;
          return {
            category_name: name,
            budgeted: budget,
            spent: used,
            percentage: budget > 0 ? (used / budget) * 100 : used > 0 ? 100 : 0,
          };
        })
        .filter((c) => c.budgeted > 0 || c.spent > 0)
        .sort((a, b) => b.spent - a.spent);

      setMetrics({
        totalIncome,
        totalSpent,
        netSavings: totalIncome - totalSpent,
      });
      setCategories(breakdown);
    } catch (error) {
      console.error('Failed to load report data:', error);
      setMetrics({ totalIncome: 0, totalSpent: 0, netSavings: 0 });
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout username={username} onLogout={onLogout} onNavigate={onNavigate}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header & Controls */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Financial Report Card</h1>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded border border-gray-300 p-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {getMonthOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="space-y-6">
            {/* Loading skeleton */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-lg border border-gray-100 bg-white p-6 shadow">
                  <div className="mb-2 h-4 w-20 rounded bg-gray-200"></div>
                  <div className="h-8 w-32 rounded bg-gray-200"></div>
                </div>
              ))}
            </div>
            <div className="min-h-[300px] animate-pulse rounded-lg border border-gray-100 bg-white p-6 shadow">
              <div className="mb-4 h-6 w-48 rounded bg-gray-200"></div>
              <div className="h-48 rounded bg-gray-200"></div>
            </div>
          </div>
        ) : (
          <>
            {/* High-Level Metrics Grid */}
            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-lg border border-gray-100 bg-white p-6 shadow">
                <h3 className="text-sm text-gray-500">Total Income</h3>
                <p className="text-2xl font-bold text-green-600">
                  ${metrics.totalIncome.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white p-6 shadow">
                <h3 className="text-sm text-gray-500">Total Spent</h3>
                <p className="text-2xl font-bold text-red-600">
                  ${metrics.totalSpent.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white p-6 shadow">
                <h3 className="text-sm text-gray-500">Net Savings</h3>
                <p className={`text-2xl font-bold ${metrics.netSavings >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  ${metrics.netSavings.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Category Breakdown Area */}
            <div className="rounded-lg border border-gray-100 bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Category Breakdown</h2>
              
              {categories.length > 0 ? (
                <div className="space-y-4">
                  {categories.map((category, index) => (
                    <div key={index} className="rounded-lg border border-gray-200 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">{category.category_name}</h3>
                        <span className="text-sm text-gray-600">
                          ${category.spent.toFixed(2)} of ${category.budgeted.toFixed(2)}
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="relative">
                        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full transition-all ${
                              category.percentage < 50
                                ? 'bg-green-500'
                                : category.percentage < 85
                                ? 'bg-yellow-400'
                                : category.percentage < 100
                                ? 'bg-orange-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, category.percentage)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-right text-xs text-gray-500">
                          {category.percentage.toFixed(1)}% used
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full min-h-[300px] items-center justify-center text-gray-400">
                  <div className="text-center">
                    <svg
                      className="mx-auto mb-4 h-12 w-12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    <p>No archived data for this month.</p>
                    <p className="mt-1 text-sm">
                      Complete a month with tracked expenses to see your report.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Note about charts */}
            <div className="mt-6 rounded-lg bg-blue-50 p-4">
              <h4 className="mb-2 font-semibold text-blue-900">Coming Soon:</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
                <li>Interactive pie charts showing spending distribution</li>
                <li>Month-over-month comparison graphs</li>
                <li>Export reports to PDF</li>
                <li>Trend analysis and predictions</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default Reports;
