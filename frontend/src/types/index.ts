/** Represents a registered user returned by the API. */
export interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
  created_at?: string;
}

/** Represents a category (standard or custom). */
export interface Category {
  id: string;
  name: string;
  is_custom: boolean;
  user_id: string | null;
}

/** 
 * Represents a budget item / expense from /api/budget endpoint.
 * Uses string-based category names.
 */
export interface BudgetItem {
  id: string;
  user_id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  created_at?: string;
  updated_at?: string;
}

/** 
 * Payload for creating or updating a budget item / expense.
 * Uses string-based category names.
 */
export interface BudgetItemPayload {
  category: string;
  description: string;
  amount: number;
  date: string;
}

/**
 * Represents a budget allocation (how much to allocate per category).
 * Uses category_id for foreign key relationship.
 */
export interface BudgetAllocation {
  id: string;
  user_id: string;
  category_id: string;
  max_budget: number;
  percentage: number;
  created_at: string;
  updated_at: string;
}

/** Payload for creating or updating a budget allocation. */
export interface BudgetAllocationPayload {
  category_id: string;
  max_budget: number;
  percentage: number;
}

/** Budget allocation as returned by GET /api/allocations (joined with category name). */
export interface BudgetAllocationView {
  id: string;
  category_id: string;
  category_name: string;
  max_budget: number;
  percentage: number;
  month: number;
  year: number;
}

/** One row of a budget plan sent to POST /api/allocations. */
export interface BudgetPlanExpense {
  category: string;
  amount: number;
  frequency: string;
}

/** An income stream (or one-off gain) as stored in income_sources. */
export interface IncomeSource {
  id?: string;
  name: string;
  amount: number;
  frequency: string;
}

/** Represents a transaction (actual spending) with category_id reference. */
export interface Transaction {
  id: string;
  user_id: string;
  category_id: string;
  category_name: string;
  description: string;
  amount: number;
  date: string;
  created_at: string;
}

/** Payload for creating a transaction. */
export interface TransactionPayload {
  category_id: string;
  description: string;
  amount: number;
  date: string;
}

/** Credentials used for login / registration. */
export interface AuthCredentials {
  username: string;
  password: string;
}

/** Response returned by the login / register endpoints. */
export interface AuthResponse {
  token: string;
  user: User;
}

/** Generic API error shape. */
export interface ApiError {
  error: string;
}

/** AI assistant response shape. */
export interface AiAdvice {
  advice: string;
}

export interface OnboardingIncomeItem {
  id: number;
  name?: string;
  amount: number;
  frequency: 'Weekly' | 'Fortnightly' | 'Monthly' | 'Yearly' | 'One-off';
}

export interface OnboardingExpenseItem {
  id: number;
  category: string;
  amount: number;
  frequency: 'Weekly' | 'Monthly' | 'Yearly';
}

export interface OnboardingPayload {
  income: OnboardingIncomeItem[];
  expenses: OnboardingExpenseItem[];
}

export interface OnboardingResponse {
  status: 'ok';
  monthly_income: number;
  monthly_expenses: number;
  surplus_stored: number;
  saved_items: number;
}

/** Combined view for dashboard display. */
export interface CategorySummary {
  category_id: string;
  category_name: string;
  max_budget: number;
  percentage: number;
  spent: number;
  remaining: number;
  progress_percent: number;
}

/** 
 * SIMPLIFIED API TYPES (String-based categories)
 * These work with the /api/budget endpoints that use category names directly
 */

/** Simple expense item with string-based category (for legacy /api/budget endpoint) */
export interface ExpenseItem {
  id: string;
  user_id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  created_at?: string;
  updated_at?: string;
}

/** Payload for creating an expense with string-based category */
export interface ExpensePayload {
  category: string;
  description: string;
  amount: number;
  date: string;
}
