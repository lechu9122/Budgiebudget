import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from '../components/MainLayout';
import CategoryDonut, { buildSlices } from '../components/CategoryDonut';
import MonthlyComparisonChart from '../components/MonthlyComparisonChart';
import {
  getAllocations,
  getTransactions,
  getIncome,
  getReportArchives,
  getApiErrorMessage,
} from '../services/api';
import type { BudgetAllocationView, IncomeSource, ReportArchiveMonth, Transaction } from '../types';
import { convertToMonthly, type Frequency } from '../utils/budgetMath';
import {
  buildMonthSeries,
  categorySpend,
  computeTrend,
  monthLabel,
  recentArchives,
  CURRENT_KEY,
  CURRENT_MONTH,
  CURRENT_YEAR,
} from '../utils/analytics';

interface ProfileProps {
  username: string;
  onLogout: () => void;
}

const Profile: React.FC<ProfileProps> = ({ username, onLogout }) => {
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Insights data
  const [archives, setArchives] = useState<ReportArchiveMonth[]>([]);
  const [allocations, setAllocations] = useState<BudgetAllocationView[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('current');
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    const storedEmail = localStorage.getItem('email') || '';
    setEmail(storedEmail);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoadingInsights(true);
        setInsightsError(null);
        // Archives first: that request also runs month-start rollover server-side,
        // so the transactions fetched after it reflect the compacted state.
        const arch = await getReportArchives();
        const [allocs, txns, inc] = await Promise.all([
          getAllocations(),
          getTransactions(),
          getIncome(),
        ]);
        setArchives(arch);
        setAllocations(allocs);
        setTransactions(txns.filter((t) => t.date.startsWith(CURRENT_KEY)));
        setIncome(inc);
      } catch (err) {
        setInsightsError(getApiErrorMessage(err, 'Failed to load your spending insights.'));
      } finally {
        setLoadingInsights(false);
      }
    })();
  }, []);

  const pastMonths = useMemo(() => recentArchives(archives), [archives]);

  const months = useMemo(
    () => buildMonthSeries(archives, allocations, transactions),
    [archives, allocations, transactions]
  );

  const trend = useMemo(() => computeTrend(months), [months]);

  // The pie follows the month picker; only the current month has live rows.
  const selectedArchive = useMemo(
    () =>
      selectedMonth === 'current'
        ? null
        : pastMonths.find((a) => `${a.year}-${a.month}` === selectedMonth) || null,
    [selectedMonth, pastMonths]
  );

  const selectedSpend = useMemo(
    () => categorySpend(selectedArchive, transactions),
    [selectedArchive, transactions]
  );

  const selectedTotal = selectedSpend.reduce((s, c) => s + c.amount, 0);

  const slices = useMemo(
    () =>
      buildSlices(
        selectedSpend.map((c) => [c.name, c.amount] as [string, number]),
        selectedTotal
      ),
    [selectedSpend, selectedTotal]
  );

  const selectedLabel = selectedArchive
    ? monthLabel(selectedArchive.year, selectedArchive.month)
    : monthLabel(CURRENT_YEAR, CURRENT_MONTH);

  /**
   * Biggest spending category across the retained months plus the current one.
   * Archives keep category totals, so this spans the whole 6-month window.
   */
  const topCategory = useMemo(() => {
    const totals = new Map<string, number>();
    pastMonths.forEach((a) =>
      a.categories.forEach((c) => {
        if (c.total_spent > 0) {
          totals.set(c.category_name, (totals.get(c.category_name) || 0) + c.total_spent);
        }
      })
    );
    transactions.forEach((t) => {
      const name = t.category_name || 'Uncategorised';
      totals.set(name, (totals.get(name) || 0) + t.amount);
    });

    const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    return ranked.length > 0 ? { name: ranked[0][0], amount: ranked[0][1] } : null;
  }, [pastMonths, transactions]);

  /**
   * Largest income stream, normalised to a monthly figure. Archives store no
   * income history, so this reflects currently configured streams only.
   */
  const topIncome = useMemo(() => {
    if (income.length === 0) return null;
    return income
      .map((s) => ({
        name: s.name || 'Income',
        monthly: convertToMonthly(s.amount, s.frequency as Frequency),
        frequency: s.frequency,
      }))
      .sort((a, b) => b.monthly - a.monthly)[0];
  }, [income]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // TODO: Call API to update profile
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match!' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters!' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      // TODO: Call API to change password
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to change password. Please check your current password.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout username={username} onLogout={onLogout}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">Profile</h1>

        {/* Message Display */}
        {message && (
          <div
            className={`mb-6 rounded-lg border p-4 ${
              message.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-6">
          {insightsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {insightsError}
            </div>
          )}

          {loadingInsights ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse rounded-lg bg-white p-6 shadow">
                    <div className="mb-2 h-4 w-32 rounded bg-gray-200"></div>
                    <div className="h-8 w-40 rounded bg-gray-200"></div>
                  </div>
                ))}
              </div>
              <div className="min-h-[280px] animate-pulse rounded-lg bg-white p-6 shadow"></div>
            </div>
          ) : (
            <>
              {/* Headline insights */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-white p-6 shadow">
                  <p className="text-sm font-medium text-gray-600">You spend the most on</p>
                  {topCategory ? (
                    <>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{topCategory.name}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        ${topCategory.amount.toFixed(2)} across{' '}
                        {pastMonths.length + 1} month{pastMonths.length === 0 ? '' : 's'}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">No spending recorded yet.</p>
                  )}
                </div>

                <div className="rounded-lg bg-white p-6 shadow">
                  <p className="text-sm font-medium text-gray-600">Biggest income source</p>
                  {topIncome ? (
                    <>
                      <p className="mt-1 text-2xl font-bold text-budget-income">{topIncome.name}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        ${topIncome.monthly.toFixed(2)}/month
                        {topIncome.frequency && topIncome.frequency !== 'Monthly' && (
                          <span className="text-gray-400"> (paid {topIncome.frequency.toLowerCase()})</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">No income streams saved yet.</p>
                  )}
                </div>
              </div>

              {/* 6-month spending history + trend */}
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-1 text-xl font-semibold text-gray-900">Monthly Spending</h2>
                <p className="mb-4 text-sm text-gray-500">
                  The last {pastMonths.length} completed month
                  {pastMonths.length === 1 ? '' : 's'} plus this month so far.
                </p>

                {months.length <= 1 ? (
                  <p className="py-8 text-center text-sm text-gray-500">
                    Keep tracking — your history appears here as months complete. The last six
                    are kept.
                  </p>
                ) : (
                  <MonthlyComparisonChart months={months} />
                )}

                {trend && (
                  <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm text-gray-700">
                    <p>
                      Across {trend.monthsUsed} completed months your spending has been{' '}
                      <span
                        className={`font-semibold ${
                          trend.slope > 0
                            ? 'text-red-600'
                            : trend.slope < 0
                            ? 'text-green-600'
                            : 'text-gray-700'
                        }`}
                      >
                        {trend.slope > 0 ? 'rising' : trend.slope < 0 ? 'falling' : 'flat'}
                        {trend.slope !== 0 && ` by about $${Math.abs(trend.slope).toFixed(2)}/month`}
                      </span>
                      {trend.pctPerMonth !== 0 &&
                        ` (${trend.pctPerMonth > 0 ? '+' : ''}${trend.pctPerMonth.toFixed(1)}%/month)`}
                      .
                    </p>
                    <p>
                      At that rate next month lands near{' '}
                      <span className="font-bold text-gray-900">${trend.prediction.toFixed(2)}</span>.
                    </p>
                  </div>
                )}
              </div>

              {/* Spending breakdown pie + month picker */}
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-1 text-xl font-semibold text-gray-900">Where Your Money Goes</h2>
                <p className="mb-4 text-sm text-gray-500">
                  Showing <span className="font-semibold text-gray-800">{selectedLabel}</span>
                  {selectedArchive && ' — archived'}
                </p>

                {slices.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">
                    No spending recorded for {selectedLabel}.
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-6 md:flex-row md:justify-center">
                    <CategoryDonut slices={slices} total={selectedTotal} />
                    <ul className="w-full max-w-xs space-y-2">
                      {slices.map((slice) => (
                        <li key={slice.name} className="flex items-center justify-between text-sm">
                          <span className="flex min-w-0 items-center gap-2 text-gray-700">
                            <span
                              className="inline-block h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: slice.color }}
                            />
                            <span className="truncate">{slice.name}</span>
                          </span>
                          <span className="shrink-0 pl-3 font-medium text-gray-900">
                            ${slice.amount.toFixed(2)}
                            <span className="ml-1 text-xs font-normal text-gray-500">
                              {(slice.fraction * 100).toFixed(1)}%
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Month picker — current month plus the six retained months */}
                <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setSelectedMonth('current')}
                    className={`rounded-full px-3 py-1.5 text-sm transition ${
                      selectedMonth === 'current'
                        ? 'bg-primary-600 font-semibold text-white'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {monthLabel(CURRENT_YEAR, CURRENT_MONTH, 'short')} (now)
                  </button>
                  {[...pastMonths].reverse().map((a) => {
                    const key = `${a.year}-${a.month}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedMonth(key)}
                        className={`rounded-full px-3 py-1.5 text-sm transition ${
                          selectedMonth === key
                            ? 'bg-primary-600 font-semibold text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {monthLabel(a.year, a.month, 'short')}
                      </button>
                    );
                  })}
                  {pastMonths.length === 0 && (
                    <span className="py-1.5 text-sm text-gray-400">
                      Past months appear here once they complete.
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Profile Information */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Profile Information</h2>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  disabled
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
                />
                <p className="mt-1 text-xs text-gray-500">Username cannot be changed</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Change Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  minLength={6}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  minLength={6}
                  required
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Account Statistics */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Account Statistics</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Months Tracked</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{pastMonths.length + 1}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Transactions This Month</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{transactions.length}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Budget Categories</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{allocations.length}</p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-lg border-2 border-red-200 bg-red-50 p-6">
            <h2 className="mb-2 text-xl font-semibold text-red-900">Danger Zone</h2>
            <p className="mb-4 text-sm text-red-700">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <button
              type="button"
              className="rounded-lg border-2 border-red-600 bg-white px-4 py-2 text-red-600 transition hover:bg-red-600 hover:text-white"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete your account? This action cannot be undone!')) {
                  // TODO: Implement account deletion
                  alert('Account deletion not yet implemented');
                }
              }}
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Profile;
