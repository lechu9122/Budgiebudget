import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '../components/MainLayout';
import {
  getCategories,
  getIncome,
  saveIncome,
  createTransaction,
  createCategory,
  getApiErrorMessage,
} from '../services/api';
import {
  parseCsvStatement,
  parsePdfStatement,
  groupLines,
  guessFrequency,
  type StatementLine,
  type StatementGroup,
} from '../utils/statementParser';
import type { Category, IncomeSource } from '../types';

interface CsvImportProps {
  username: string;
  onLogout: () => void;
  onNavigate: (page: 'dashboard' | 'csv-import' | 'reports' | 'profile') => void;
}

const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Yearly', 'One-off'];

interface IncomeGroupState extends StatementGroup {
  include: boolean;
  streamName: string;
  frequency: string;
  typicalAmount: number;
  alreadyExists: boolean;
}

interface ExpenseGroupState extends StatementGroup {
  include: boolean;
  categoryId: string;
}

const CsvImport: React.FC<CsvImportProps> = ({ username, onLogout, onNavigate }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [existingIncome, setExistingIncome] = useState<IncomeSource[]>([]);

  const [incomeGroups, setIncomeGroups] = useState<IncomeGroupState[]>([]);
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroupState[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    Promise.all([getCategories(), getIncome()])
      .then(([cats, inc]) => {
        setCategories(cats);
        setExistingIncome(inc);
      })
      .catch((err) => console.error('Failed to load categories/income:', err));
  }, []);

  const otherCategoryId = useMemo(
    () => categories.find((c) => c.name === 'Other')?.id || '',
    [categories]
  );

  // ------------------------------------------------------------------
  // Classification: credits -> income streams, debits -> expense groups
  // ------------------------------------------------------------------
  const toIncomeGroup = (g: StatementGroup): IncomeGroupState => {
    const latest = [...g.lines].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const alreadyExists = existingIncome.some(
      (s) => s.name.trim().toLowerCase() === g.name.trim().toLowerCase()
    );
    return {
      ...g,
      include: !alreadyExists,
      // Drop trailing reference numbers from the default stream name
      streamName: g.name.replace(/[\s\-#*]*[\dx]+$/i, '').trim() || g.name,
      frequency: guessFrequency(g.lines.map((l) => l.date)),
      typicalAmount: latest.amount,
      alreadyExists,
    };
  };

  const toExpenseGroup = (g: StatementGroup): ExpenseGroupState => ({
    ...g,
    include: true,
    // Recurring expenses need the user's category choice; one-timers
    // default to "Other" as a one-off note.
    categoryId: g.lines.length > 1 ? '' : otherCategoryId,
  });

  const classify = (lines: StatementLine[]) => {
    setIncomeGroups(groupLines(lines.filter((l) => l.kind === 'credit')).map(toIncomeGroup));
    setExpenseGroups(groupLines(lines.filter((l) => l.kind === 'debit')).map(toExpenseGroup));
  };

  const moveGroupToExpenses = (key: string) => {
    const g = incomeGroups.find((x) => x.key === key);
    if (!g) return;
    setIncomeGroups((prev) => prev.filter((x) => x.key !== key));
    setExpenseGroups((prev) => [...prev, toExpenseGroup(g)]);
  };

  const moveGroupToIncome = (key: string) => {
    const g = expenseGroups.find((x) => x.key === key);
    if (!g) return;
    setExpenseGroups((prev) => prev.filter((x) => x.key !== key));
    setIncomeGroups((prev) => [...prev, toIncomeGroup(g)]);
  };

  // ------------------------------------------------------------------
  // Upload & parse
  // ------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files && e.target.files[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError(null);
    setWarnings([]);
    setIncomeGroups([]);
    setExpenseGroups([]);
    setParsing(true);

    try {
      const isPdf =
        selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf');
      const parsed = isPdf
        ? await parsePdfStatement(selected)
        : parseCsvStatement(await selected.text());

      setWarnings(parsed.warnings);
      if (parsed.lines.length === 0 && parsed.warnings.length === 0) {
        setError('No transactions found in this file.');
      }
      classify(parsed.lines);
    } catch (err) {
      console.error('Statement parsing failed:', err);
      setError('Could not read this file. Try a CSV export from your bank.');
    } finally {
      setParsing(false);
    }
  };

  // ------------------------------------------------------------------
  // Import
  // ------------------------------------------------------------------
  const recurringMissingCategory = expenseGroups.filter(
    (g) => g.include && g.lines.length > 1 && !g.categoryId
  ).length;

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      // 1. Income streams: append the ticked ones to the saved income sources
      const newStreams = incomeGroups.filter((g) => g.include && g.typicalAmount > 0);
      if (newStreams.length > 0) {
        await saveIncome([
          ...existingIncome,
          ...newStreams.map((g) => ({
            name: g.streamName.trim() || g.name,
            amount: g.typicalAmount,
            frequency: g.frequency,
          })),
        ]);
      }

      // 2. Expenses: every line of every included group becomes a transaction
      let imported = 0;
      for (const g of expenseGroups) {
        if (!g.include || !g.categoryId) continue;
        for (const line of g.lines) {
          await createTransaction({
            category_id: g.categoryId,
            description: line.description,
            amount: line.amount,
            date: line.date,
          });
          imported++;
        }
      }

      setResult(
        `Imported ${imported} expense${imported === 1 ? '' : 's'}` +
          (newStreams.length > 0
            ? ` and ${newStreams.length} income stream${newStreams.length === 1 ? '' : 's'}`
            : '') +
          '.'
      );
      setFile(null);
      setIncomeGroups([]);
      setExpenseGroups([]);
      setExistingIncome(await getIncome());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Import failed part-way through. Check the dashboard before retrying.'));
    } finally {
      setImporting(false);
    }
  };

  const handleNewCategory = async (key: string) => {
    const name = window.prompt('New category name:');
    if (!name || !name.trim()) return;
    try {
      const cat = await createCategory(name.trim());
      setCategories((prev) => [...prev, cat]);
      setExpenseGroups((prev) =>
        prev.map((g) => (g.key === key ? { ...g, categoryId: cat.id } : g))
      );
    } catch (err) {
      alert(getApiErrorMessage(err, 'Could not create the category.'));
    }
  };

  const recurring = expenseGroups.filter((g) => g.lines.length > 1);
  const oneTime = expenseGroups.filter((g) => g.lines.length === 1);

  return (
    <MainLayout username={username} onLogout={onLogout} onNavigate={onNavigate}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Import Bank Statement</h2>
          <p className="mb-6 text-sm text-gray-500">
            Upload a CSV or PDF bank statement. Deposits are detected as income streams
            (named from the statement reference), recurring expenses are matched to your
            categories, and one-time expenses are noted automatically.
          </p>

          {result && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
              {result}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}
          {warnings.map((w) => (
            <div key={w} className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {w}
            </div>
          ))}

          {/* Upload */}
          <div className="mb-6 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
            <input
              type="file"
              accept=".csv,.pdf,application/pdf,text/csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: <span className="font-medium">{file.name}</span>
              </p>
            )}
            {parsing && <p className="mt-2 text-sm text-blue-600">Reading statement…</p>}
          </div>

          {/* Detected income streams */}
          {incomeGroups.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-1 text-lg font-semibold text-gray-900">Detected income</h3>
              <p className="mb-3 text-sm text-gray-500">
                Deposits grouped by statement reference. Ticked ones are saved as income
                streams with the reference as their name.
              </p>
              <div className="space-y-2">
                {incomeGroups.map((g) => (
                  <div key={g.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50/40 p-3">
                    <input
                      type="checkbox"
                      checked={g.include}
                      onChange={(e) =>
                        setIncomeGroups((prev) =>
                          prev.map((x) => (x.key === g.key ? { ...x, include: e.target.checked } : x))
                        )
                      }
                      className="h-4 w-4 accent-green-600"
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={g.streamName}
                        onChange={(e) =>
                          setIncomeGroups((prev) =>
                            prev.map((x) => (x.key === g.key ? { ...x, streamName: e.target.value } : x))
                          )
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-medium"
                      />
                      <p className="mt-0.5 text-xs text-gray-500">
                        {g.lines.length} deposit{g.lines.length === 1 ? '' : 's'} • total ${g.total.toFixed(2)}
                        {g.alreadyExists && (
                          <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-gray-600">
                            already an income stream
                          </span>
                        )}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={g.typicalAmount || ''}
                      onChange={(e) =>
                        setIncomeGroups((prev) =>
                          prev.map((x) =>
                            x.key === g.key ? { ...x, typicalAmount: parseFloat(e.target.value) || 0 } : x
                          )
                        )
                      }
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                      title="Typical amount per deposit"
                    />
                    <select
                      value={g.frequency}
                      onChange={(e) =>
                        setIncomeGroups((prev) =>
                          prev.map((x) => (x.key === g.key ? { ...x, frequency: e.target.value } : x))
                        )
                      }
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => moveGroupToExpenses(g.key)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      title="This isn't income"
                    >
                      Treat as expense
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recurring expenses */}
          {recurring.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-1 text-lg font-semibold text-gray-900">Recurring expenses</h3>
              <p className="mb-3 text-sm text-gray-500">
                These appear more than once — pick which of your categories each belongs to.
              </p>
              <div className="space-y-2">
                {recurring.map((g) => (
                  <div key={g.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3">
                    <input
                      type="checkbox"
                      checked={g.include}
                      onChange={(e) =>
                        setExpenseGroups((prev) =>
                          prev.map((x) => (x.key === g.key ? { ...x, include: e.target.checked } : x))
                        )
                      }
                      className="h-4 w-4 accent-primary-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{g.name}</p>
                      <p className="text-xs text-gray-500">
                        {g.lines.length} times • total ${g.total.toFixed(2)}
                      </p>
                    </div>
                    <select
                      value={g.categoryId}
                      onChange={(e) =>
                        setExpenseGroups((prev) =>
                          prev.map((x) => (x.key === g.key ? { ...x, categoryId: e.target.value } : x))
                        )
                      }
                      className={`rounded border px-2 py-1 text-sm ${
                        g.include && !g.categoryId ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Choose category…</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleNewCategory(g.key)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      + New
                    </button>
                    <button
                      type="button"
                      onClick={() => moveGroupToIncome(g.key)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      title="This is actually income"
                    >
                      Treat as income
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* One-time expenses */}
          {oneTime.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-1 text-lg font-semibold text-gray-900">One-time expenses</h3>
              <p className="mb-3 text-sm text-gray-500">
                Seen once on this statement — noted as one-off expenses (category "Other"
                unless you change it).
              </p>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded border border-gray-100 p-2">
                {oneTime.map((g) => (
                  <div key={g.key} className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={g.include}
                      onChange={(e) =>
                        setExpenseGroups((prev) =>
                          prev.map((x) => (x.key === g.key ? { ...x, include: e.target.checked } : x))
                        )
                      }
                      className="h-4 w-4 accent-primary-600"
                    />
                    <span className="w-24 shrink-0 text-xs text-gray-500">{g.lines[0].date}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-800">{g.name}</span>
                    <span className="shrink-0 font-medium text-gray-900">${g.total.toFixed(2)}</span>
                    <select
                      value={g.categoryId}
                      onChange={(e) =>
                        setExpenseGroups((prev) =>
                          prev.map((x) => (x.key === g.key ? { ...x, categoryId: e.target.value } : x))
                        )
                      }
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="">Skip</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => moveGroupToIncome(g.key)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      Income?
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Import action */}
          {(incomeGroups.length > 0 || expenseGroups.length > 0) && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {recurringMissingCategory > 0
                  ? `${recurringMissingCategory} recurring expense group(s) still need a category.`
                  : 'Ready to import.'}
              </p>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || recurringMissingCategory > 0}
                className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import to BudgieBudget'}
              </button>
            </div>
          )}

          {/* Instructions */}
          {!file && incomeGroups.length === 0 && expenseGroups.length === 0 && (
            <div className="mt-6 rounded-lg bg-blue-50 p-4">
              <h4 className="mb-2 font-semibold text-blue-900">Supported files:</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
                <li><strong>CSV</strong> — with Date, Description and Amount columns (or separate Debit/Credit columns). Negative amounts are treated as money out.</li>
                <li><strong>PDF</strong> — text-based bank statements (best effort; scanned images are not supported).</li>
                <li>Dates in YYYY-MM-DD, DD/MM/YYYY or "12 Jun 2026" formats.</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default CsvImport;
