import React, { useEffect, useState } from 'react';
import { BudgetItem, BudgetItemPayload } from '../types';

interface BudgetFormProps {
  initialValues?: BudgetItem;
  onSubmit: (payload: BudgetItemPayload) => void;
  onCancel?: () => void;
}

const COMMON_CATEGORIES = [
  'Rent',
  'Groceries',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Dining Out',
  'Shopping',
  'Other'
];

const emptyForm = (): BudgetItemPayload => ({
  category: '',
  description: '',
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
});

const BudgetForm: React.FC<BudgetFormProps> = ({ initialValues, onSubmit, onCancel }) => {
  const [form, setForm] = useState<BudgetItemPayload>(emptyForm());
  const [showCustomCategory, setShowCustomCategory] = useState(false);

  useEffect(() => {
    if (initialValues) {
      const isCommonCategory = COMMON_CATEGORIES.includes(initialValues.category);
      setForm({
        category: initialValues.category,
        description: initialValues.description,
        amount: initialValues.amount,
        date: initialValues.date,
      });
      setShowCustomCategory(!isCommonCategory);
    } else {
      setForm(emptyForm());
      setShowCustomCategory(false);
    }
  }, [initialValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'category' && value === 'custom') {
      setShowCustomCategory(true);
      setForm((prev) => ({ ...prev, category: '' }));
      return;
    }
    
    if (name === 'category' && value !== 'custom') {
      setShowCustomCategory(false);
    }
    
    setForm((prev) => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
    if (!initialValues) {
      setForm(emptyForm());
      setShowCustomCategory(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category Field */}
        <div>
          <label htmlFor="category" className="label">
            Category
          </label>
          {!showCustomCategory ? (
            <select
              id="category"
              name="category"
              value={form.category || ''}
              onChange={handleChange}
              required
              className="input"
            >
              <option value="">Select a category</option>
              {COMMON_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="custom">+ Custom Category</option>
            </select>
          ) : (
            <div className="relative">
              <input
                type="text"
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder="Enter custom category"
                required
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => {
                  setShowCustomCategory(false);
                  setForm((prev) => ({ ...prev, category: '' }));
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Use predefined categories"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Amount Field */}
        <div>
          <label htmlFor="amount" className="label">
            Amount
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500">$</span>
            </div>
            <input
              id="amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount || ''}
              onChange={handleChange}
              required
              className="input pl-8"
            />
          </div>
        </div>

        {/* Description Field */}
        <div>
          <label htmlFor="description" className="label">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="description"
            name="description"
            type="text"
            placeholder="e.g., Weekly grocery shopping"
            value={form.description}
            onChange={handleChange}
            className="input"
          />
        </div>

        {/* Date Field */}
        <div>
          <label htmlFor="date" className="label">
            Date
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <input
              id="date"
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
              required
              className="input pl-10"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn btn-primary flex-1 md:flex-none">
          <svg className="h-5 w-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {initialValues ? 'Update Item' : 'Add Item'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

export default BudgetForm;
