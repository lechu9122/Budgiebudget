import React from 'react';

export interface MonthTotals {
  label: string; // e.g. "Jun"
  fullLabel: string; // e.g. "June 2026"
  budgeted: number;
  spent: number;
  isCurrent?: boolean;
}

interface MonthlyComparisonChartProps {
  months: MonthTotals[]; // oldest first
}

const BUDGETED_COLOR = '#0d9488'; // teal — validated pair with the violet below
const SPENT_COLOR = '#7c3aed'; // primary violet

/**
 * Month-over-month grouped bar chart: budgeted vs spent per month.
 * Hover a bar for the exact value.
 */
const MonthlyComparisonChart: React.FC<MonthlyComparisonChartProps> = ({ months }) => {
  const width = 560;
  const height = 240;
  const margin = { top: 16, right: 8, bottom: 28, left: 48 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const maxValue = Math.max(1, ...months.flatMap((m) => [m.budgeted, m.spent]));
  const yScale = (v: number) => plotH - (v / maxValue) * plotH;

  const groupW = plotW / Math.max(months.length, 1);
  const barW = Math.min(22, Math.max(10, groupW / 3));

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxValue);

  return (
    <div className="overflow-x-auto">
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Month-over-month comparison of budgeted versus spent amounts"
        style={{ minWidth: 420 }}
      >
        {/* Recessive gridlines + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={margin.top + yScale(t)}
              y2={margin.top + yScale(t)}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text
              x={margin.left - 6}
              y={margin.top + yScale(t) + 3}
              textAnchor="end"
              fontSize="10"
              className="fill-gray-400"
            >
              ${t >= 1000 ? `${(t / 1000).toFixed(1)}k` : t.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Bars: budgeted + spent per month, 2px apart, rounded tops */}
        {months.map((m, i) => {
          const cx = margin.left + groupW * i + groupW / 2;
          const bars = [
            { value: m.budgeted, color: BUDGETED_COLOR, x: cx - barW - 1, series: 'Budgeted' },
            { value: m.spent, color: SPENT_COLOR, x: cx + 1, series: 'Spent' },
          ];
          return (
            <g key={m.fullLabel}>
              {bars.map((bar) => (
                <rect
                  key={bar.series}
                  x={bar.x}
                  y={margin.top + yScale(bar.value)}
                  width={barW}
                  height={Math.max(plotH - yScale(bar.value), bar.value > 0 ? 2 : 0)}
                  fill={bar.color}
                  rx={3}
                  className="transition-opacity hover:opacity-75"
                >
                  <title>{`${m.fullLabel} — ${bar.series}: $${bar.value.toFixed(2)}`}</title>
                </rect>
              ))}
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                className={m.isCurrent ? 'fill-gray-900' : 'fill-gray-500'}
                fontWeight={m.isCurrent ? 700 : 400}
              >
                {m.label}
                {m.isCurrent ? '*' : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex items-center gap-5 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: BUDGETED_COLOR }} />
          Budgeted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: SPENT_COLOR }} />
          Spent
        </span>
        {months.some((m) => m.isCurrent) && <span className="text-gray-400">* current month so far</span>}
      </div>
    </div>
  );
};

export default MonthlyComparisonChart;
