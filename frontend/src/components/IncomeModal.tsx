import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { convertToMonthly, roundToCent, type Frequency } from '../utils/budgetMath';
import { getApiErrorMessage } from '../services/api';
import type { IncomeSource } from '../types';

interface IncomeModalProps {
  isOpen: boolean;
  sources: IncomeSource[];
  onSave: (sources: IncomeSource[]) => Promise<void>;
  onClose: () => void;
}

const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Yearly', 'One-off'] as const;

const monthlyOf = (s: IncomeSource) =>
  convertToMonthly(s.amount || 0, s.frequency as Frequency);

/** Shared name/amount/frequency fields for editing or adding an income source. */
const IncomeFields: React.FC<{
  draft: IncomeSource;
  onChange: (patch: Partial<IncomeSource>) => void;
}> = ({ draft, onChange }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_130px_150px]">
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
      <input
        type="text"
        placeholder="e.g. Day Job, Tax refund"
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
      />
    </div>
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">Amount ($)</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={draft.amount || ''}
        onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
      />
    </div>
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">Frequency</label>
      <select
        value={draft.frequency}
        onChange={(e) => onChange({ frequency: e.target.value })}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
      >
        {FREQUENCIES.map((f) => (
          <option key={f} value={f}>{f === 'One-off' ? 'One-off (this month)' : f}</option>
        ))}
      </select>
    </div>
  </div>
);

/**
 * Income focus window: shows this month's earnings first, with per-source
 * Edit buttons for the recurring streams and an Add Income box for new
 * streams or one-off money gained this month.
 */
const IncomeModal: React.FC<IncomeModalProps> = ({ isOpen, sources, onSave, onClose }) => {
  const [list, setList] = useState<IncomeSource[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<IncomeSource | null>(null);
  const [addDraft, setAddDraft] = useState<IncomeSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setList(sources);
      setEditingIndex(null);
      setEditDraft(null);
      setAddDraft(null);
      setError(null);
    }
  }, [isOpen, sources]);

  const monthlyTotal = useMemo(
    () => roundToCent(list.reduce((sum, s) => sum + monthlyOf(s), 0)),
    [list]
  );

  const persist = async (next: IncomeSource[]) => {
    setSaving(true);
    setError(null);
    try {
      const cleaned = next
        .filter((s) => s.amount > 0)
        .map(({ name, amount, frequency }) => ({
          name: name.trim(),
          amount: roundToCent(amount),
          frequency,
        }));
      await onSave(cleaned);
      setList(cleaned);
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save your income. Please try again.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditDraft({ ...list[index] });
    setAddDraft(null);
  };

  const saveEdit = async () => {
    if (editingIndex === null || !editDraft) return;
    const next = list.map((s, i) => (i === editingIndex ? editDraft : s));
    if (await persist(next)) {
      setEditingIndex(null);
      setEditDraft(null);
    }
  };

  const removeSource = async () => {
    if (editingIndex === null) return;
    const next = list.filter((_, i) => i !== editingIndex);
    if (await persist(next)) {
      setEditingIndex(null);
      setEditDraft(null);
    }
  };

  const saveAdd = async () => {
    if (!addDraft || addDraft.amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (await persist([...list, addDraft])) {
      setAddDraft(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-2xl" zIndexClass="z-[65]">
      {/* This month's earnings, front and center */}
      <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-5 text-center">
        <p className="text-sm font-medium text-green-800">
          Your earnings this month —{' '}
          {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
        <p className="mt-1 text-4xl font-bold text-green-700">${monthlyTotal.toFixed(2)}</p>
        <p className="mt-1 text-xs text-green-700/70">
          {list.length} income source{list.length === 1 ? '' : 's'}, converted to monthly amounts
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Income sources */}
      <div className="space-y-3">
        {list.length === 0 && !addDraft && (
          <p className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
            No income sources yet. Use "Add Income" below to add one.
          </p>
        )}

        {list.map((source, index) =>
          editingIndex === index && editDraft ? (
            /* Editing row */
            <div key={index} className="rounded-xl border-2 border-primary-200 bg-primary-50/40 p-4">
              <IncomeFields
                draft={editDraft}
                onChange={(patch) => setEditDraft((d) => (d ? { ...d, ...patch } : d))}
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={removeSource}
                  disabled={saving}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingIndex(null); setEditDraft(null); }}
                    disabled={saving}
                    className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving || editDraft.amount <= 0}
                    className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* View row */
            <div
              key={index}
              className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">
                  {source.name || 'Income'}
                  {source.frequency === 'One-off' && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      One-off
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500">
                  ${source.amount.toFixed(2)} {source.frequency.toLowerCase()}
                  {source.frequency !== 'Monthly' && (
                    <span className="text-gray-400"> • ${monthlyOf(source).toFixed(2)}/month</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startEdit(index)}
                disabled={saving || editingIndex !== null}
                className="ml-3 shrink-0 rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
              >
                Edit
              </button>
            </div>
          )
        )}

        {/* Add income box */}
        {addDraft && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-green-200 bg-green-50/40 p-4">
            <div className="min-w-0 flex-1">
              <IncomeFields
                draft={addDraft}
                onChange={(patch) => setAddDraft((d) => (d ? { ...d, ...patch } : d))}
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={saveAdd}
                  disabled={saving || addDraft.amount <= 0}
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
                >
                  {saving ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
            {/* Cancel to the right of the box, for mispresses */}
            <button
              type="button"
              onClick={() => setAddDraft(null)}
              disabled={saving}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
              title="Remove this box"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Footer: Close left, Add Income bottom right */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-gray-700 transition hover:bg-gray-100"
        >
          Close
        </button>
        {!addDraft && (
          <button
            type="button"
            onClick={() => {
              setAddDraft({ name: '', amount: 0, frequency: 'Monthly' });
              setEditingIndex(null);
              setEditDraft(null);
            }}
            disabled={saving}
            className="rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white transition hover:bg-primary-700 disabled:opacity-60"
          >
            + Add Income
          </button>
        )}
      </div>
    </Modal>
  );
};

export default IncomeModal;
