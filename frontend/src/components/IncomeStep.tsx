import React, { useMemo, useState } from 'react';
import { convertToMonthly, roundToCent, type IncomeFrequency, type IncomeItem } from '../utils/budgetMath';

// We create a local Draft type so TypeScript knows 'name' exists while we edit
export type IncomeDraft = {
  id: number;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
};

interface IncomeStepProps {
  initialItems?: IncomeItem[];
  onNext: (items: IncomeItem[]) => void;
}

const nextId = () => Date.now() + Math.floor(Math.random() * 1000);

const BAR_COLORS = ['bg-primary-500', 'bg-blue-400', 'bg-teal-400', 'bg-indigo-400', 'bg-purple-400'];

const IncomeStep: React.FC<IncomeStepProps> = ({ initialItems, onNext }) => {
  // Map any initial items into our Draft format (adding an empty name if it doesn't exist)
  const [items, setItems] = useState<IncomeDraft[]>(
    initialItems && initialItems.length > 0
      ? initialItems.map((item) => ({ ...item, name: (item as any).name || '' }))
      : [{ id: nextId(), name: '', amount: 0, frequency: 'Monthly' }]
  );

  const monthlyTotal = useMemo(() => {
    const total = items.reduce((sum, item) => sum + convertToMonthly(item.amount, item.frequency), 0);
    return roundToCent(total);
  }, [items]);

  const updateItem = (id: number, patch: Partial<IncomeDraft>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addRow = () => {
    setItems((prev) => [...prev, { id: nextId(), name: '', amount: 0, frequency: 'Monthly' }]);
  };

  const removeRow = (id: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  };

  const handleNext = () => {
    // We cast back to IncomeItem to satisfy the onNext prop requirements,
    // while passing the name along in case your backend accepts it later.
    const finalized = items.map((item) => ({
      ...item,
      amount: roundToCent(item.amount),
    })) as unknown as IncomeItem[];
    
    onNext(finalized);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Let's start with your income.</h2>

      {/* Dynamic Visual Breakdown Bar */}
      <div className="mt-6 mb-8 rounded-xl border border-gray-200 p-4 bg-gray-50">
        <div className="flex justify-between items-end mb-2">
          <span className="text-sm font-medium text-gray-600">Total Monthly Income</span>
          <span className="text-2xl font-bold text-green-600">${monthlyTotal.toFixed(2)}</span>
        </div>
        
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden flex shadow-inner">
          {items.map((item, index) => {
            const monthlyVal = convertToMonthly(item.amount || 0, item.frequency);
            const percentage = monthlyTotal > 0 ? (monthlyVal / monthlyTotal) * 100 : 0;
            
            return percentage > 0 ? (
              <div 
                key={`bar-${item.id}`} 
                style={{ width: `${percentage}%` }} 
                className={`h-full transition-all duration-500 ease-out ${BAR_COLORS[index % BAR_COLORS.length]}`}
                title={`${item.name || `Source ${index + 1}`}: ${percentage.toFixed(0)}%`}
              />
            ) : null;
          })}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_180px_auto]">
            
            {/* Name Input */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                placeholder="e.g. Day Job"
                value={item.name}
                onChange={(e) => updateItem(item.id, { name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              />
            </div>

            {/* Amount Input */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount || ''}
                  onChange={(e) => updateItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                />
              </div>
            </div>

            {/* Frequency Dropdown */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Frequency</label>
              <select
                value={item.frequency}
                onChange={(e) => updateItem(item.id, { frequency: e.target.value as IncomeFrequency })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white"
              >
                <option value="Weekly">Weekly</option>
                <option value="Fortnightly">Fortnightly</option>
                <option value="Monthly">Monthly</option>
                <option value="Yearly">Yearly</option>
              </select>
            </div>

            <div className="flex items-end justify-end pb-[2px]">
              <button
                type="button"
                onClick={() => removeRow(item.id)}
                disabled={items.length <= 1}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                title="Remove source"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-primary-300 px-4 py-2 text-primary-700 transition hover:bg-primary-50"
        >
          + Add income source
        </button>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleNext}
          disabled={monthlyTotal <= 0}
          className="rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white transition hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default IncomeStep;