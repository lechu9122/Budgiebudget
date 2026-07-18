export type Frequency = "Daily" | "Weekly" | "Fortnightly" | "Monthly" | "Yearly" | "One-off";
export type IncomeFrequency = "Weekly" | "Fortnightly" | "Monthly" | "Yearly" | "One-off";

export interface IncomeItem {
  id: number;
  amount: number;
  frequency: IncomeFrequency;
}

export interface ExpenseItem {
  id: number;
  category: string;
  amount: number;
  frequency: Frequency;
}

/**
 * Rounds any numeric value to exactly 2 decimal places.
 */
export function roundToCent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates the budget amount based on monthly income and percentage allocation.
 * 
 * @param income - Total monthly income
 * @param percentage - Percentage of income to allocate (0-100)
 * @returns Budget amount rounded to 2 decimal places
 */
export function calculateBudgetAmount(income: number, percentage: number): number {
  if (income < 0 || percentage < 0 || percentage > 100) {
    return 0;
  }
  return roundToCent((income * percentage) / 100);
}

/**
 * Converts an amount with a given recurrence frequency into a monthly equivalent.
 *
 * Formulas:
 * Daily: amount * (365 / 12)
 * Weekly: amount * (52 / 12)
 * Fortnightly: amount * (26 / 12)
 * Monthly: amount
 * Yearly: amount / 12
 */
export function convertToMonthly(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case "Daily":
      return roundToCent(amount * (365 / 12));
    case "Weekly":
      return roundToCent(amount * (52 / 12));
    case "Fortnightly":
      return roundToCent(amount * (26 / 12));
    case "Monthly":
      return roundToCent(amount);
    case "Yearly":
      return roundToCent(amount / 12);
    case "One-off":
      return roundToCent(amount); // counts once, in the current month
    default:
      return roundToCent(amount);
  }
}
