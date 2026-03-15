import React, { useMemo, useState } from 'react';
import { convertToMonthly, roundToCent, type Frequency } from '../utils/budgetMath';

interface BudgetFormModalProps {
  isOpen: boolean;
  onSave: (payload: { itemName: string; category: string; amount: number; frequency: Frequency }) => Promise<void> | void;
  onCancel: () => void;
}

const categories = ['Rent', 'Groceries', 'Utilities', 'Transport', 'Entertainment', 'Other'];

const BudgetFormModal: React.FC<BudgetFormModalProps> = ({ isOpen, onSave, onCancel }) => {
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState(categories[0]);
  const [frequency, setFrequency] = useState<Frequency>('Monthly');
  const [saving, setSaving] = useState(false);

  const monthlyPreview = useMemo(() => convertToMonthly(amount, frequency), [amount, frequency]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ itemName, category, amount: roundToCent(amount), frequency });
      setItemName('');
      setAmount(0);
      setCategory(categories[0]);
      setFrequency('Monthly');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSave}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-2xl font-bold text-gray-900">New Budget Item</h2>
        <p className="mt-1 text-sm text-gray-500">Add one item with a frequency-aware amount.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Item Name</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              placeholder="e.g., Weekly groceries"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            Monthly equivalent: <span className="font-semibold">${monthlyPreview.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BudgetFormModal;
