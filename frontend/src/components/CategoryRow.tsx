import React, { useState } from 'react';

interface CategoryRowProps {
  categoryName: string;
  spent: number;
  maxBudget: number;
  percentage: number; // Percentage of income this category represents
  onClick: () => void;
}

export const CategoryRow: React.FC<CategoryRowProps> = ({
  categoryName,
  spent,
  maxBudget,
  percentage,
  onClick,
}) => {
  const [showEditHint, setShowEditHint] = useState(false);

  // 1. Calculate the percentage spent
  const progressPercent = maxBudget > 0 ? (spent / maxBudget) * 100 : 0;

  // 2. Cap the visual width at 100% so the bar doesn't break out of its container
  const visualWidth = Math.min(progressPercent, 100);

  // 3. Dynamic color logic
  let barColor = 'bg-green-500';
  if (progressPercent >= 50 && progressPercent < 85) {
    barColor = 'bg-yellow-400';
  } else if (progressPercent >= 85) {
    barColor = 'bg-red-500';
  }

  // 4. Calculate remaining amount
  const remaining = maxBudget - spent;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setShowEditHint(true)}
      onMouseLeave={() => setShowEditHint(false)}
      className="group cursor-pointer rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:border-blue-300 mb-4 relative"
    >
      {/* Edit Hint Tooltip */}
      {showEditHint && (
        <div className="absolute top-0 right-0 mt-2 mr-2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          Click to view breakdown
        </div>
      )}

      <div className="mb-2 flex items-end justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800 transition-colors group-hover:text-blue-600">
            {categoryName}
          </h3>
          <p className="text-sm text-gray-600">
            ${spent.toFixed(2)} of ${maxBudget.toFixed(2)} spent
            <span className="ml-2 text-gray-400">
              ({percentage.toFixed(1)}% of income)
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">
            ${remaining.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500">remaining</p>
        </div>
      </div>

      {/* The Fill-Up Line (Progress Bar) */}
      <div className="relative">
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-3 rounded-full transition-all duration-500 ease-out ${barColor}`}
            style={{ width: `${visualWidth}%` }}
          ></div>
        </div>
        <p className="mt-1 text-right text-xs text-gray-500">
          {progressPercent.toFixed(1)}% used
        </p>
      </div>

      {/* Warning Text if Over Budget */}
      {progressPercent > 100 && (
        <p className="mt-2 text-xs font-medium text-red-500">
          ⚠️ Over budget by ${(spent - maxBudget).toFixed(2)}
        </p>
      )}
    </div>
  );
};

export default CategoryRow;
