import React, { useState } from 'react';
import Modal from './Modal';
import ExpenseStep, { type ExpenseDraft } from './ExpenseStep';
import { saveBudgetPlan, getApiErrorMessage } from '../services/api';

interface BudgetEditorModalProps {
  isOpen: boolean;
  totalMonthlyIncome: number;
  /** Current budget plan, prefilled from saved allocations. */
  initialItems: ExpenseDraft[];
  onSaved: () => void;
  onClose: () => void;
}

/**
 * Standalone budget editor (separate from the onboarding wizard): edit this
 * month's expense allocations against your saved income. Saving replaces the
 * month's budget plan; leftover income is stored as Savings automatically.
 */
const BudgetEditorModal: React.FC<BudgetEditorModalProps> = ({
  isOpen,
  totalMonthlyIncome,
  initialItems,
  onSaved,
  onClose,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async (items: ExpenseDraft[]) => {
    setSaving(true);
    setError(null);
    try {
      await saveBudgetPlan(
        items.map((item) => ({
          category: item.category === 'Custom' ? item.customCategory || 'Custom' : item.category,
          amount: item.amount,
          frequency: item.frequency,
        }))
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save your budget. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={true} onClose={onClose} maxWidthClass="max-w-4xl" zIndexClass="z-[65]">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Edit Budget</h1>
        <p className="text-sm text-gray-500">
          Adjust this month's expense allocations. Anything unallocated is saved as Savings.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <ExpenseStep
        totalMonthlyIncome={totalMonthlyIncome}
        initialItems={initialItems}
        onBack={onClose}
        onFinish={handleFinish}
        backLabel="Cancel"
        finishLabel={saving ? 'Saving...' : 'Save Budget'}
        title=""
      />
    </Modal>
  );
};

export default BudgetEditorModal;
