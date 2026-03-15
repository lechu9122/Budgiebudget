import axios, { AxiosInstance } from 'axios';
import {
  AuthCredentials,
  AuthResponse,
  BudgetItem,
  BudgetItemPayload,
  Category,
  Transaction,
  TransactionPayload,
  ExpenseItem,
  ExpensePayload,
  AiAdvice,
  OnboardingPayload,
  OnboardingResponse,
} from '../types';

// Base URL is proxied to the C++ backend (configured in package.json "proxy").
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach the JWT token to every request when available.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized errors by clearing token and redirecting to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      // Redirect to login page
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// --- Auth ---

export const register = (credentials: AuthCredentials): Promise<AuthResponse> =>
  api.post<AuthResponse>('/auth/register', credentials).then((r) => r.data);

export const login = (credentials: AuthCredentials): Promise<AuthResponse> =>
  api.post<AuthResponse>('/auth/login', credentials).then((r) => r.data);

// --- Categories ---

export const getCategories = (): Promise<Category[]> =>
  api.get<Category[]>('/categories').then((r) => r.data);

export const createCategory = (name: string): Promise<Category> =>
  api.post<Category>('/categories', { name }).then((r) => r.data);

// --- Budget Items ---

export const getBudgetItems = (): Promise<BudgetItem[]> =>
  api.get<BudgetItem[]>('/budget').then((r) => r.data);

export const createBudgetItem = (payload: BudgetItemPayload): Promise<BudgetItem> =>
  api.post<BudgetItem>('/budget', payload).then((r) => r.data);

export const updateBudgetItem = (
  id: number,
  payload: BudgetItemPayload
): Promise<BudgetItem> =>
  api.put<BudgetItem>(`/budget/${id}`, payload).then((r) => r.data);

export const deleteBudgetItem = (id: number): Promise<void> =>
  api.delete(`/budget/${id}`).then(() => undefined);

// --- Transactions ---

export const getTransactions = (): Promise<Transaction[]> =>
  api.get<Transaction[]>('/transactions').then((r) => r.data);

export const createTransaction = (payload: TransactionPayload): Promise<Transaction> =>
  api.post<Transaction>('/transactions', payload).then((r) => r.data);

// --- AI Advisor ---

export const getAiAdvice = (): Promise<AiAdvice> =>
  api.get<AiAdvice>('/ai/advice').then((r) => r.data);

// --- Onboarding ---

export const postOnboarding = (payload: OnboardingPayload): Promise<OnboardingResponse> =>
  api.post<OnboardingResponse>('/onboarding', payload).then((r) => r.data);

// ===================================================================
// SIMPLIFIED EXPENSE API (String-based categories, /api/budget endpoint)
// ===================================================================

/**
 * Adds a new expense using category name instead of ID.
 * This uses the legacy /api/budget endpoint with string categories.
 */
export const addExpense = async (payload: ExpensePayload): Promise<ExpenseItem> =>
  api.post<ExpenseItem>('/budget', payload).then((r) => r.data);

/**
 * Fetches all expenses from the /api/budget endpoint.
 * These have string-based category names rather than category_id.
 * @param month Optional YYYY-MM format to filter by month
 */
export const getExpenses = async (month?: string): Promise<ExpenseItem[]> => {
  const params = month ? { month } : {};
  return api.get<ExpenseItem[]>('/budget', { params }).then((r) => r.data);
};

/**
 * Updates an existing expense by ID.
 */
export const updateExpense = async (
  id: number,
  payload: ExpensePayload
): Promise<ExpenseItem> =>
  api.put<ExpenseItem>(`/budget/${id}`, payload).then((r) => r.data);

/**
 * Deletes an expense by ID.
 */
export const deleteExpense = async (id: number): Promise<void> =>
  api.delete(`/budget/${id}`).then(() => undefined);

/**
 * Fetches list of category names (strings) for autocomplete.
 * This extracts unique category names from the categories table.
 */
export const getCategoryNames = async (): Promise<string[]> =>
  api.get<Category[]>('/categories').then((r) => r.data.map((cat) => cat.name));

/**
 * Saves a newly created custom category to the backend.
 * Returns the full category object.
 */
export const addCustomCategory = async (categoryName: string): Promise<Category> =>
  api.post<Category>('/categories', { name: categoryName }).then((r) => r.data);
