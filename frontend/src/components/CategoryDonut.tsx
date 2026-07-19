import React, { useState } from 'react';

// Categorical palette, fixed assignment order (validated: lightness band,
// chroma floor, CVD separation, contrast — all pass on light surface).
export const SLICE_COLORS = ['#7c3aed', '#b45309', '#0d9488', '#be185d', '#2563eb', '#15803d'];

export interface DonutSlice {
  name: string;
  amount: number;
  fraction: number;
  color: string;
}

/**
 * Turn (name, amount) pairs into donut slices: sorted descending, colors
 * assigned in fixed order, categories beyond the palette folded into "Other".
 */
export const buildSlices = (entries: Array<[string, number]>, total: number): DonutSlice[] => {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const max = SLICE_COLORS.length;
  const top = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  const folded: Array<[string, number]> =
    rest.length > 1
      ? [...top, ['Other', rest.reduce((s, [, v]) => s + v, 0)] as [string, number]]
      : sorted;

  return folded.map(([name, amount], i) => ({
    name,
    amount,
    fraction: total > 0 ? amount / total : 0,
    color: SLICE_COLORS[i],
  }));
};

interface CategoryDonutProps {
  slices: DonutSlice[];
  total: number;
  size?: number;
  centerCaption?: string;
}

/**
 * Interactive donut: hover a slice to highlight it and see its name, amount
 * and share in the center; the default center shows the total.
 */
const CategoryDonut: React.FC<CategoryDonutProps> = ({
  slices,
  total,
  size = 200,
  centerCaption = 'total spent',
}) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const strokeWidth = 20;
  const radius = (size - strokeWidth - 8) / 2; // leave room for hover growth
  const circumference = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? 2 : 0;

  let offset = 0;
  const arcs = slices.map((slice) => {
    const length = Math.max(slice.fraction * circumference - gap, 0);
    const arc = { ...slice, length, offset };
    offset += slice.fraction * circumference;
    return arc;
  });

  const active = hovered !== null ? slices[hovered] : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Spending distribution: $${total.toFixed(2)} across ${slices.length} categories`}
      onMouseLeave={() => setHovered(null)}
    >
      {arcs.map((arc, i) => (
        <circle
          key={arc.name}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={hovered === i ? strokeWidth + 6 : strokeWidth}
          strokeDasharray={`${arc.length} ${circumference}`}
          strokeDashoffset={-arc.offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={hovered === null || hovered === i ? 1 : 0.4}
          className="cursor-pointer transition-all duration-150"
          onMouseEnter={() => setHovered(i)}
        >
          <title>{`${arc.name}: $${arc.amount.toFixed(2)} (${(arc.fraction * 100).toFixed(1)}%)`}</title>
        </circle>
      ))}
      {active ? (
        <>
          <text x="50%" y="42%" textAnchor="middle" className="fill-gray-600" fontSize="12">
            {active.name}
          </text>
          <text x="50%" y="53%" textAnchor="middle" className="fill-gray-900" fontSize="20" fontWeight="700">
            ${active.amount.toFixed(2)}
          </text>
          <text x="50%" y="63%" textAnchor="middle" className="fill-gray-500" fontSize="12">
            {(active.fraction * 100).toFixed(1)}%
          </text>
        </>
      ) : (
        <>
          <text x="50%" y="46%" textAnchor="middle" className="fill-gray-900" fontSize="22" fontWeight="700">
            ${total.toFixed(2)}
          </text>
          <text x="50%" y="57%" textAnchor="middle" className="fill-gray-500" fontSize="12">
            {centerCaption}
          </text>
        </>
      )}
    </svg>
  );
};

export default CategoryDonut;
