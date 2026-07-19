import React, { useMemo, useState } from 'react';
import { roundToCent, convertToMonthly } from '../utils/budgetMath';

export type ExpenseFrequency = 'Weekly' | 'Monthly' | 'Yearly';

export type ExpenseDraft = {
  id: number;
  category: string;
  customCategory: string;
  percentage: number;
  amount: number;
  frequency: ExpenseFrequency;
};

interface ExpenseStepProps {
  totalMonthlyIncome: number;
  initialItems?: ExpenseDraft[];
  onBack: () => void;
  onFinish: (items: ExpenseDraft[]) => void;
  backLabel?: string;
  finishLabel?: string;
  /** Heading text; pass '' to hide (when the host modal has its own header). */
  title?: string;
}

const nextId = () => Date.now() + Math.floor(Math.random() * 1000);
const categories = ['Rent', 'Groceries', 'Utilities', 'Transport', 'Entertainment', 'Custom'];

const ExpenseStep: React.FC<ExpenseStepProps> = ({
  totalMonthlyIncome,
  initialItems,
  onBack,
  onFinish,
  backLabel = 'Back',
  finishLabel = 'Finish Onboarding',
  title = "Now let's map your expenses.",
}) => {
  const [items, setItems] = useState<ExpenseDraft[]>(
    initialItems && initialItems.length > 0
      ? initialItems
      : [
          {
            id: nextId(),
            category: 'Rent',
            customCategory: '',
            percentage: 0,
            amount: 0,
            frequency: 'Monthly',
          },
        ]
  );

  // Total amount needs to sum up the MONTHLY equivalent of everything.
  // The entered amounts are the single source of truth — percentages are
  // derived for display only and never fed back into the amounts.
  const totalAmount = useMemo(() => {
    return roundToCent(
      items.reduce((sum, item) => sum + convertToMonthly(item.amount, item.frequency as any), 0)
    );
  }, [items]);

  const percentOfIncome = (item: ExpenseDraft): number =>
    totalMonthlyIncome > 0
      ? (convertToMonthly(item.amount, item.frequency as any) / totalMonthlyIncome) * 100
      : 0;

  const totalPercentage = totalMonthlyIncome > 0 ? (totalAmount / totalMonthlyIncome) * 100 : 0;
  const remainder = roundToCent(totalMonthlyIncome - totalAmount);
  const exceeds = totalAmount > totalMonthlyIncome;

  const updateItem = (id: number, patch: Partial<ExpenseDraft>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      { 
        id: nextId(), 
        category: 'Groceries', 
        customCategory: '', 
        percentage: 0,
        amount: 0,
        frequency: 'Monthly' 
      },
    ]);
  };

  const removeRow = (id: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  };

  return (
    <div>
      {title && <h2 className="text-2xl font-bold text-gray-900">{title}</h2>}
      <p className="mt-1 text-sm text-gray-500">
        Allocate percentages or exact amounts of your monthly income: <strong className="text-gray-900">${totalMonthlyIncome.toFixed(2)}</strong>
      </p>

      {exceeds && (
        <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-red-700">
          <strong>Warning:</strong> Your total allocation exceeds your income!
        </div>
      )}

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-gray-200 p-4">
            {/* Adjusted grid layout to fit Category, Amount, Frequency, and Remove button */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_130px_130px_auto]">
              
              {/* Category Dropdown (Made relatively smaller via grid cols) */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={item.category}
                  onChange={(e) => updateItem(item.id, { category: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                
                {item.category === 'Custom' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={item.customCategory}
                      onChange={(e) => updateItem(item.id, { customCategory: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 text-sm"
                      placeholder="Type custom name..."
                    />
                  </div>
                )}
              </div>

              {/* Amount Number Input */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount || ''}
                  onChange={(e) => updateItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                />
                <div className="text-xs text-gray-500 mt-1 pl-1 whitespace-nowrap">
                  ≈ {percentOfIncome(item).toFixed(1)}% of income
                </div>
              </div>

              {/* Frequency Dropdown */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Frequency</label>
                <select
                  value={item.frequency}
                  onChange={(e) => updateItem(item.id, { frequency: e.target.value as ExpenseFrequency })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white"
                >
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Yearly">Yearly</option>
                </select>
              </div>

              {/* Remove Button */}
              <div className="flex items-start">
                <button
                  type="button"
                  onClick={() => removeRow(item.id)}
                  disabled={items.length <= 1}
                  className="mt-6 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                  title="Remove expense"
                >
                  ✕
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-4 rounded-lg border border-primary-300 px-4 py-2 text-primary-700 transition hover:bg-primary-50"
      >
        + Add expense
      </button>

      {/* Footer Metrics Panel */}
      <div className="mt-6 rounded-xl border border-gray-200 p-4 bg-gray-50">
        <div className="mb-2 flex items-center justify-between text-sm text-gray-700">
          <span className="font-medium">Total Allocated (Monthly)</span>
          <span className={exceeds ? 'text-red-700 font-bold text-lg' : 'font-bold text-lg text-primary-700'}>
            ${totalAmount.toFixed(2)} <span className="text-sm font-normal text-gray-500">({totalPercentage.toFixed(1)}%)</span>
          </span>
        </div>
        
        {/* Fill Bar */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 shadow-inner">
          <div
            className={`h-full transition-all duration-300 ${exceeds ? 'bg-red-500' : 'bg-primary-500'}`}
            style={{ width: `${Math.min(100, totalPercentage)}%` }}
          />
        </div>
        
        <div className={`mt-3 text-sm font-medium ${remainder >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {remainder >= 0 ? 'Remaining to budget:' : 'Over budget by:'} ${Math.abs(remainder).toFixed(2)}
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-gray-700 transition hover:bg-gray-100"
        >
          {backLabel}
        </button>
        <button
          type="button"
          onClick={() => onFinish(items)}
          disabled={exceeds}
          className="rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:opacity-70"
        >
          {finishLabel}
        </button>
      </div>
    </div>
  );
};

export default ExpenseStep;