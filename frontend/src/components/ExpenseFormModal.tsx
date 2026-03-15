import React, { useState, useEffect, useMemo } from 'react';
import type { Category, TransactionPayload } from '../types';

interface ExpenseFormModalProps {
  isOpen: boolean;
  categories: Category[];
  onSave: (payload: TransactionPayload) => Promise<void>;
  onCreateCategory: (name: string) => Promise<Category>;
  onCancel: () => void;
}

const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  isOpen,
  categories,
  onSave,
  onCreateCategory,
  onCancel,
}) => {
  const [date, setDate] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [categorySearch, setCategorySearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Set default date to today when modal opens
  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split('T')[0];
      setDate(today);
    }
  }, [isOpen]);

  // Filter categories based on search input
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const search = categorySearch.toLowerCase();
    return categories.filter((cat) => cat.name.toLowerCase().includes(search));
  }, [categories, categorySearch]);

  // Check if we should show "Create category" option
  const showCreateOption = useMemo(() => {
    if (!categorySearch.trim()) return false;
    const exactMatch = categories.some(
      (cat) => cat.name.toLowerCase() === categorySearch.toLowerCase()
    );
    return !exactMatch;
  }, [categories, categorySearch]);

  // Get selected category name for display
  const selectedCategoryName = useMemo(() => {
    const cat = categories.find((c) => c.id === selectedCategory);
    return cat ? cat.name : '';
  }, [categories, selectedCategory]);

  if (!isOpen) return null;

  const handleCategorySelect = (categoryId: string, categoryName: string) => {
    setSelectedCategory(categoryId);
    setCategorySearch(categoryName);
    setShowDropdown(false);
  };

  const handleCreateCategory = async () => {
    if (!categorySearch.trim()) return;
    
    setSaving(true);
    try {
      const newCategory = await onCreateCategory(categorySearch.trim());
      setSelectedCategory(newCategory.id);
      setCategorySearch(newCategory.name);
      setShowDropdown(false);
    } catch (error) {
      console.error('Failed to create category:', error);
      alert('Failed to create category. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCategory) {
      alert('Please select a category');
      return;
    }

    if (!description.trim()) {
      alert('Please enter a description');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        category_id: selectedCategory,
        description: description.trim(),
        amount: amountNum,
        date: date,
      });

      // Reset form
      setDate(new Date().toISOString().split('T')[0]);
      setAmount('');
      setDescription('');
      setCategorySearch('');
      setSelectedCategory(null);
    } catch (error) {
      console.error('Failed to save expense:', error);
      alert('Failed to save expense. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-md">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-2xl font-bold text-gray-900">Add Expense</h2>
        <p className="mt-1 text-sm text-gray-500">Record a new transaction</p>

        <div className="mt-6 space-y-4">
          {/* Date Input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              required
            />
          </div>

          {/* Amount Input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Amount ($)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="0.00"
              required
            />
          </div>

          {/* Description Input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="e.g., Grocery shopping at Walmart"
              required
            />
          </div>

          {/* Smart Category Autocomplete */}
          <div className="relative">
            <label className="mb-2 block text-sm font-medium text-gray-700">Category</label>
            <input
              type="text"
              value={categorySearch}
              onChange={(e) => {
                setCategorySearch(e.target.value);
                setShowDropdown(true);
                // Clear selection if user modifies the search
                if (selectedCategoryName !== e.target.value) {
                  setSelectedCategory(null);
                }
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Search or create category..."
              required
            />

            {/* Dropdown */}
            {showDropdown && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
                {/* Filtered Categories */}
                {filteredCategories.length > 0 && (
                  <div>
                    {filteredCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategorySelect(cat.id, cat.name)}
                        className="w-full px-4 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                      >
                        <div className="font-medium text-gray-900">{cat.name}</div>
                        {cat.is_custom && (
                          <div className="text-xs text-gray-500">Custom</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Create New Category Option */}
                {showCreateOption && categorySearch.trim() && (
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={saving}
                    className="w-full border-t border-gray-200 px-4 py-2 text-left hover:bg-green-50 focus:bg-green-50 focus:outline-none disabled:opacity-50"
                  >
                    <div className="font-medium text-green-600">
                      ✨ Create "{categorySearch.trim()}"
                    </div>
                    <div className="text-xs text-gray-500">Add as custom category</div>
                  </button>
                )}

                {/* No Results */}
                {filteredCategories.length === 0 && !showCreateOption && (
                  <div className="px-4 py-2 text-sm text-gray-500">No categories found</div>
                )}
              </div>
            )}
          </div>

          {/* Selected Category Display */}
          {selectedCategory && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm">
              <span className="text-blue-700">
                Selected: <span className="font-semibold">{selectedCategoryName}</span>
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Add Expense'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExpenseFormModal;
