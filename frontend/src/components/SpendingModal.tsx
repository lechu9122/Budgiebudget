import React, { useMemo } from 'react';
import Modal from './Modal';
import CategoryDonut, { buildSlices, type DonutSlice } from './CategoryDonut';
import type { Transaction } from '../types';

interface SpendingModalProps {
  isOpen: boolean;
  /** Transactions to break down (already scoped to the period shown). */
  transactions: Transaction[];
  periodLabel: string;
  onClose: () => void;
}

/**
 * Focus window breaking down where money went: a pie of spending by category
 * plus an itemised list of every expense.
 */
const SpendingModal: React.FC<SpendingModalProps> = ({ isOpen, transactions, periodLabel, onClose }) => {
  const total = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  );

  const slices = useMemo((): DonutSlice[] => {
    const byCategory = new Map<string, number>();
    transactions.forEach((t) => {
      const name = t.category_name || 'Uncategorised';
      byCategory.set(name, (byCategory.get(name) || 0) + t.amount);
    });
    return buildSlices(Array.from(byCategory.entries()), total);
  }, [transactions, total]);

  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-2xl" zIndexClass="z-[55]">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Spending Breakdown</h2>
        <p className="text-sm text-gray-500">{periodLabel}</p>
      </div>

      {transactions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
          No expenses tracked yet this month. Open a budget category and use
          "Track Expense" to log what you bought.
        </p>
      ) : (
        <>
          {/* Pie + legend */}
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:justify-center">
            <CategoryDonut slices={slices} total={total} />
            <ul className="w-full max-w-xs space-y-2 md:mt-4">
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

          {/* Itemised expenses */}
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              All expenses
            </h3>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {sortedTransactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0 pr-3">
                    <p className="truncate font-medium text-gray-800">
                      {t.description || 'Expense'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.category_name || 'Uncategorised'} • {t.date}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-gray-900">
                    ${t.amount.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-gray-700 transition hover:bg-gray-100"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

export default SpendingModal;
