import React, { useMemo, useState } from 'react';
import IncomeStep from './IncomeStep';
import ExpenseStep, { type ExpenseDraft } from './ExpenseStep';
import { convertToMonthly, roundToCent, type IncomeItem } from '../utils/budgetMath';

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
  allowClose?: boolean;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  isOpen,
  onClose,
  onCompleted,
  allowClose = true,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
  const [expenseItems, setExpenseItems] = useState<ExpenseDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalMonthlyIncome = useMemo(() => {
    const total = incomeItems.reduce((sum, item) => sum + convertToMonthly(item.amount, item.frequency), 0);
    return roundToCent(total);
  }, [incomeItems]);

  const handleOnboardingSubmit = async (incomeData: unknown[], expenseData: unknown[]) => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('You are not logged in. Please sign in again.');
    }

    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        income: incomeData,
        expenses: expenseData,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not complete onboarding.');
    }

    return data;
  };

  if (!isOpen) return null;

  const finish = async (items: ExpenseDraft[]) => {
    setSubmitting(true);
    setError(null);
    setExpenseItems(items);

    const incomeData = incomeItems.map((item) => ({
      id: item.id,
      amount: roundToCent(item.amount),
      frequency: item.frequency,
    }));

    const expenseData = items.map((item) => ({
      id: item.id,
      category: item.category === 'Custom' ? item.customCategory || 'Custom' : item.category,
      amount: roundToCent(item.amount),
      frequency: item.frequency,
    }));

    try {
      const data = await handleOnboardingSubmit(incomeData, expenseData);
      console.log('Success! Surplus stored:', data.surplus_stored);
      onCompleted();
      onClose();
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Could not complete onboarding. Please check your totals and try again.';
      console.error('Onboarding error:', err);
      setError(message);
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Budget Onboarding</h1>
            <p className="text-sm text-gray-500">Step {step} of 2</p>
          </div>
          {allowClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Close
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === 1 ? (
          <IncomeStep
            initialItems={incomeItems}
            onNext={(items) => {
              setIncomeItems(items);
              setStep(2);
            }}
          />
        ) : (
          <>
            <ExpenseStep
              totalMonthlyIncome={totalMonthlyIncome}
              initialItems={expenseItems}
              onBack={() => setStep(1)}
              onFinish={finish}
            />
            {submitting && <p className="mt-4 text-sm text-gray-500">Saving onboarding data...</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;
