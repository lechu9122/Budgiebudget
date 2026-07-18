import React from 'react';
import Modal from './Modal';
import type { Transaction } from '../types';

interface CategoryDetailModalProps {
  isOpen: boolean;
  categoryName: string;
  maxBudget: number;
  spent: number;
  transactions: Transaction[];
  onTrackExpense: () => void;
  onSetBudget: () => void;
  onClose: () => void;
}

const SPENT_COLOR = '#7c3aed'; // primary-600
const OVER_COLOR = '#e53e3e'; // budget-expense
const TRACK_COLOR = '#e5e7eb'; // gray-200

/** Donut meter: spent slice on a neutral "remaining" track. */
const BudgetDonut: React.FC<{ maxBudget: number; spent: number }> = ({ maxBudget, spent }) => {
  const size = 180;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const overBudget = maxBudget > 0 && spent > maxBudget;
  const fraction = maxBudget > 0 ? Math.min(spent / maxBudget, 1) : spent > 0 ? 1 : 0;
  const remaining = maxBudget - spent;
  const color = overBudget || maxBudget === 0 ? OVER_COLOR : SPENT_COLOR;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Budget $${maxBudget.toFixed(2)}, spent $${spent.toFixed(2)}, remaining $${remaining.toFixed(2)}`}
    >
      {/* Remaining track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={TRACK_COLOR}
        strokeWidth={strokeWidth}
      >
        <title>{`Remaining: $${Math.max(remaining, 0).toFixed(2)}`}</title>
      </circle>
      {/* Spent slice */}
      {fraction > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-500"
        >
          <title>{`Spent: $${spent.toFixed(2)}`}</title>
        </circle>
      )}
      {/* Center hero number */}
      {overBudget ? (
        <>
          <text x="50%" y="46%" textAnchor="middle" className="fill-red-600" fontSize="20" fontWeight="700">
            -${Math.abs(remaining).toFixed(2)}
          </text>
          <text x="50%" y="58%" textAnchor="middle" className="fill-gray-500" fontSize="12">
            over budget
          </text>
        </>
      ) : (
        <>
          <text x="50%" y="46%" textAnchor="middle" className="fill-gray-900" fontSize="22" fontWeight="700">
            ${Math.max(remaining, 0).toFixed(2)}
          </text>
          <text x="50%" y="58%" textAnchor="middle" className="fill-gray-500" fontSize="12">
            remaining
          </text>
        </>
      )}
    </svg>
  );
};

const CategoryDetailModal: React.FC<CategoryDetailModalProps> = ({
  isOpen,
  categoryName,
  maxBudget,
  spent,
  transactions,
  onTrackExpense,
  onSetBudget,
  onClose,
}) => {
  const remaining = maxBudget - spent;
  const overBudget = maxBudget > 0 && spent > maxBudget;
  const percentUsed = maxBudget > 0 ? (spent / maxBudget) * 100 : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} zIndexClass="z-[55]">
      <>
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900">{categoryName}</h2>
          <p className="text-sm text-gray-500">
            {maxBudget > 0
              ? `$${maxBudget.toFixed(2)} monthly budget • ${percentUsed.toFixed(1)}% used`
              : 'No budget allocated yet'}
          </p>
        </div>

        {/* Donut + legend */}
        <div className="flex flex-col items-center">
          <BudgetDonut maxBudget={maxBudget} spent={spent} />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm">
            <span className="flex items-center gap-2 text-gray-700">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: overBudget || maxBudget === 0 ? OVER_COLOR : SPENT_COLOR }}
              />
              Spent ${spent.toFixed(2)}
            </span>
            <span className="flex items-center gap-2 text-gray-700">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: TRACK_COLOR }} />
              Remaining ${Math.max(remaining, 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* No budget yet: offer the onboarding flow */}
        {maxBudget === 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You're tracking expenses in this category but haven't allocated a budget for it.
            <button
              type="button"
              onClick={onSetBudget}
              className="mt-2 block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-medium text-amber-800 transition hover:bg-amber-100"
            >
              Set a budget (opens budget setup)
            </button>
          </div>
        )}

        {/* Expense log */}
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Expense log
          </h3>
          {transactions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
              Nothing tracked yet. Use "Track Expense" to log what you bought.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {transactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0 pr-3">
                    <p className="truncate font-medium text-gray-800">
                      {t.description || 'Expense'}
                    </p>
                    <p className="text-xs text-gray-500">{t.date}</p>
                  </div>
                  <span className="shrink-0 font-semibold text-gray-900">
                    ${t.amount.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onTrackExpense}
            className="rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white transition hover:bg-primary-700"
          >
            Track Expense
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-gray-700 transition hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </>
    </Modal>
  );
};

export default CategoryDetailModal;
