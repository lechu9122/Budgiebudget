import React, { useState } from 'react';
import MainLayout from '../components/MainLayout';

// Temporary interface for parsed CSV rows
interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  category_id?: number;
}

interface CsvImportProps {
  username: string;
  onLogout: () => void;
  onNavigate: (page: 'dashboard' | 'csv-import' | 'reports' | 'profile') => void;
}

const CsvImport: React.FC<CsvImportProps> = ({ username, onLogout, onNavigate }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      // TODO: Implement PapaParse here to read e.target.files[0]
      // and update setParsedData with the results.
      
      // Placeholder: Simulate parsing
      setParsedData([
        { date: '2026-03-01', description: 'Sample Transaction 1', amount: 50.00 },
        { date: '2026-03-02', description: 'Sample Transaction 2', amount: 75.50 },
      ]);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      // TODO: Send parsedData to your C++ backend via api.ts
      console.log('Sending to backend:', parsedData);
      
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      alert('Import successful! (This is a placeholder - implement backend integration)');
      
      // Reset form
      setFile(null);
      setParsedData([]);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed. Please try again.');
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

          {/* Data Preview Skeleton */}
          {file && (
            <div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                Preview (Assign Categories)
              </h3>
              <div className="mb-4 min-h-[200px] rounded border border-gray-200 bg-gray-50 p-4">
                {parsedData.length > 0 ? (
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
                              <select className="rounded border border-gray-300 px-2 py-1 text-sm">
                                <option value="">Select Category...</option>
                                {/* TODO: Populate with actual categories from getCategories() */}
                                <option value="1">Groceries</option>
                                <option value="2">Transportation</option>
                                <option value="3">Entertainment</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">Parsing data...</p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleImport}
                  disabled={importing || parsedData.length === 0}
                  className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Save to Ledger'}
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
