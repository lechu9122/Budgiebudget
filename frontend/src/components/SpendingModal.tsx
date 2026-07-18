import React, { useMemo } from 'react';
import Modal from './Modal';
import type { Transaction } from '../types';

interface SpendingModalProps {
  isOpen: boolean;
  /** Transactions to break down (already scoped to the period shown). */
  transactions: Transaction[];
  periodLabel: string;
  onClose: () => void;
}

// Categorical palette, fixed assignment order (validated: lightness band,
// chroma floor, CVD separation, contrast — all pass on light surface).
const SLICE_COLORS = ['#7c3aed', '#b45309', '#0d9488', '#be185d', '#2563eb', '#15803d'];
const MAX_SLICES = SLICE_COLORS.length;

interface Slice {
  name: string;
  amount: number;
  fraction: number;
  color: string;
}

/** Donut of spending by category with a 2px surface gap between slices. */
const SpendingDonut: React.FC<{ slices: Slice[]; total: number }> = ({ slices, total }) => {
  const size = 200;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? 2 : 0;

  let offset = 0;
  const arcs = slices.map((slice) => {
    const length = Math.max(slice.fraction * circumference - gap, 0);
    const arc = { ...slice, length, offset };
    offset += slice.fraction * circumference;
    return arc;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Total spent $${total.toFixed(2)} across ${slices.length} categories`}
    >
      {arcs.map((arc) => (
        <circle
          key={arc.name}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc.length} ${circumference}`}
          strokeDashoffset={-arc.offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        >
          <title>{`${arc.name}: $${arc.amount.toFixed(2)} (${(arc.fraction * 100).toFixed(1)}%)`}</title>
        </circle>
      ))}
      <text x="50%" y="46%" textAnchor="middle" className="fill-gray-900" fontSize="22" fontWeight="700">
        ${total.toFixed(2)}
      </text>
      <text x="50%" y="57%" textAnchor="middle" className="fill-gray-500" fontSize="12">
        total spent
      </text>
    </svg>
  );
};

/**
 * Focus window breaking down where money went: a pie of spending by category
 * plus an itemised list of every expense.
 */
const SpendingModal: React.FC<SpendingModalProps> = ({ isOpen, transactions, periodLabel, onClose }) => {
  const total = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  );

  const slices = useMemo((): Slice[] => {
    const byCategory = new Map<string, number>();
    transactions.forEach((t) => {
      const name = t.category_name || 'Uncategorised';
      byCategory.set(name, (byCategory.get(name) || 0) + t.amount);
    });

    const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);

    // Fixed hue order; categories beyond the palette fold into "Other".
    const top = sorted.slice(0, MAX_SLICES - 1);
    const rest = sorted.slice(MAX_SLICES - 1);
    const entries: Array<[string, number]> =
      rest.length > 1
        ? [...top, ['Other', rest.reduce((s, [, v]) => s + v, 0)] as [string, number]]
        : sorted;

    return entries.map(([name, amount], i) => ({
      name,
      amount,
      fraction: total > 0 ? amount / total : 0,
      color: SLICE_COLORS[i],
    }));
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
            <SpendingDonut slices={slices} total={total} />
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
