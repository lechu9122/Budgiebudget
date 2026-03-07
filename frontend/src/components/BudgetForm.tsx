import React, { useEffect, useState } from 'react';
import { BudgetItem, BudgetItemPayload } from '../types';

interface BudgetFormProps {
  initialValues?: BudgetItem;
  onSubmit: (payload: BudgetItemPayload) => void;
  onCancel?: () => void;
}

const emptyForm = (): BudgetItemPayload => ({
  category: '',
  description: '',
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
});

const BudgetForm: React.FC<BudgetFormProps> = ({ initialValues, onSubmit, onCancel }) => {
  const [form, setForm] = useState<BudgetItemPayload>(emptyForm());

  useEffect(() => {
    if (initialValues) {
      setForm({
        category: initialValues.category,
        description: initialValues.description,
        amount: initialValues.amount,
        date: initialValues.date,
      });
    } else {
      setForm(emptyForm());
    }
  }, [initialValues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
    if (!initialValues) setForm(emptyForm());
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <input
        name="category"
        placeholder="Category (e.g. Rent)"
        value={form.category}
        onChange={handleChange}
        required
        style={{ padding: 8, flexGrow: 1, minWidth: 140 }}
      />
      <input
        name="description"
        placeholder="Description (optional)"
        value={form.description}
        onChange={handleChange}
        style={{ padding: 8, flexGrow: 2, minWidth: 180 }}
      />
      <input
        name="amount"
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount"
        value={form.amount}
        onChange={handleChange}
        required
        style={{ padding: 8, width: 110 }}
      />
      <input
        name="date"
        type="date"
        value={form.date}
        onChange={handleChange}
        required
        style={{ padding: 8 }}
      />
      <button type="submit" style={{ padding: '8px 16px' }}>
        {initialValues ? 'Update' : 'Add Item'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} style={{ padding: '8px 16px' }}>
          Cancel
        </button>
      )}
    </form>
  );
};

export default BudgetForm;
