import React, { useEffect, useState } from 'react';
import MainLayout from '../components/MainLayout';
import { getCategories, createTransaction } from '../services/api';
import type { Category } from '../types';

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  category_id: string;
}

interface CsvImportProps {
  username: string;
  onLogout: () => void;
  onNavigate: (page: 'dashboard' | 'csv-import' | 'reports' | 'profile') => void;
}

/** Split a single CSV line, honouring double-quoted fields. */
const splitCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
};

const parseCsv = (text: string): { rows: ParsedRow[]; error: string | null } => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], error: 'CSV must have a header row and at least one data row.' };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = header.indexOf('date');
  const descIdx = header.indexOf('description');
  const amountIdx = header.indexOf('amount');
  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
    return { rows: [], error: 'CSV header must contain Date, Description and Amount columns.' };
  }

  const rows: ParsedRow[] = [];
  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const date = fields[dateIdx] || '';
    const description = fields[descIdx] || '';
    const amount = Math.abs(parseFloat((fields[amountIdx] || '').replace(/[$,]/g, '')));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(amount)) continue;
    rows.push({ date, description, amount, category_id: '' });
  }

  if (rows.length === 0) {
    return { rows: [], error: 'No valid rows found. Check dates are YYYY-MM-DD and amounts are numeric.' };
  }
  return { rows, error: null };
};

const CsvImport: React.FC<CsvImportProps> = ({ username, onLogout, onNavigate }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files && e.target.files[0];
    if (!selected) return;
    setFile(selected);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      const { rows, error } = parseCsv(String(reader.result || ''));
      setParsedData(rows);
      setParseError(error);
    };
    reader.readAsText(selected);
  };

  const setRowCategory = (index: number, categoryId: string) => {
    setParsedData((prev) =>
      prev.map((row, i) => (i === index ? { ...row, category_id: categoryId } : row))
    );
  };

  const rowsReady = parsedData.filter((r) => r.category_id).length;

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const toImport = parsedData.filter((r) => r.category_id);
      let imported = 0;
      for (const row of toImport) {
        await createTransaction({
          category_id: row.category_id,
          description: row.description,
          amount: row.amount,
          date: row.date,
        });
        imported++;
      }
      setImportResult(`Imported ${imported} transaction${imported === 1 ? '' : 's'} successfully.`);
      setFile(null);
      setParsedData([]);
    } catch (error) {
      console.error('Import failed:', error);
      setImportResult('Import failed part-way through. Check the dashboard and try the remaining rows again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <MainLayout username={username} onLogout={onLogout} onNavigate={onNavigate}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
            Import Bank Statement (.csv)
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            Upload your bank statement CSV file to automatically import transactions into your budget.
          </p>

          {importResult && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
              {importResult}
            </div>
          )}

          {/* Upload Section */}
          <div className="mb-6 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          {parseError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {parseError}
            </div>
          )}

          {/* Data Preview */}
          {file && parsedData.length > 0 && (
            <div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                Preview (Assign Categories)
              </h3>
              <p className="mb-2 text-sm text-gray-500">
                Rows without a category are skipped. {rowsReady} of {parsedData.length} rows ready.
              </p>
              <div className="mb-4 min-h-[200px] rounded border border-gray-200 bg-gray-50 p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-300 bg-gray-100">
                      <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Description</th>
                        <th className="px-4 py-2">Amount</th>
                        <th className="px-4 py-2">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.map((row, index) => (
                        <tr key={index} className="border-b border-gray-200">
                          <td className="px-4 py-2">{row.date}</td>
                          <td className="px-4 py-2">{row.description}</td>
                          <td className="px-4 py-2">${row.amount.toFixed(2)}</td>
                          <td className="px-4 py-2">
                            <select
                              value={row.category_id}
                              onChange={(e) => setRowCategory(index, e.target.value)}
                              className="rounded border border-gray-300 px-2 py-1 text-sm"
                            >
                              <option value="">Select Category...</option>
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleImport}
                  disabled={importing || rowsReady === 0}
                  className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing ? 'Importing...' : `Save ${rowsReady} to Ledger`}
                </button>
              </div>
            </div>
          )}

          {/* Instructions */}
          {!file && (
            <div className="mt-6 rounded-lg bg-blue-50 p-4">
              <h4 className="mb-2 font-semibold text-blue-900">CSV Format Requirements:</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
                <li>File must contain columns: Date, Description, Amount</li>
                <li>Date format: YYYY-MM-DD (e.g., 2026-03-07)</li>
                <li>Amount should be positive numbers (e.g., 50.00)</li>
                <li>CSV should have a header row</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default CsvImport;
