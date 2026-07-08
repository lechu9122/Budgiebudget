import axios, { AxiosInstance } from 'axios';

declare const process: {
  env: {
    REACT_APP_API_URL?: string;
  };
};

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ==========================================
// Types & Interfaces
// ==========================================
export interface RegisterRequest {
  username: string;
  email: string;
  name: string;
  phone?: string;
  password: string;
}

export interface LoginRequest {
  emailOrUsername: string;
  password: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Category {
  id: string;
  name: string;
  is_custom: boolean;
  user_id: string | null;
}

export interface TransactionPayload {
  category_id: string;
  description: string;
  amount: number;
  date: string;
}

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

export interface BudgetItem {
  id: string;
  user_id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  created_at: string;
  updated_at: string;
}

// Added missing Expense Types to fix compiler errors
export interface ExpenseItem {
  id: number | string;
  category: string;
  description: string;
  amount: number;
  date: string;
}

export interface ExpensePayload {
  category: string;
  description: string;
  amount: number;
  date: string;
}

// ==========================================
// Auth Endpoints
// ==========================================
export const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/register', data);
  return response.data;
};

export const login = async (data: LoginRequest): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/login', data);
  return response.data;
};

// ==========================================
// Budget / Expense Endpoints
// ==========================================
export const getBudgetItems = async (): Promise<BudgetItem[]> => {
  const response = await apiClient.get<BudgetItem[]>('/api/budget');
  return response.data;
};

export const createBudgetItem = async (item: any): Promise<BudgetItem> => {
  const response = await apiClient.post<BudgetItem>('/api/budget', item);
  return response.data;
};

export const updateBudgetItem = async (id: string, item: any): Promise<BudgetItem> => {
  const response = await apiClient.put<BudgetItem>(`/api/budget/${id}`, item);
  return response.data;
};

export const deleteBudgetItem = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/budget/${id}`);
};

// Legacy/Alternative Expense functions (Fixed missing 'apiClient' references)
export const addExpense = async (payload: ExpensePayload): Promise<ExpenseItem> =>
  apiClient.post<ExpenseItem>('/api/budget', payload).then((r) => r.data);

export const getExpenses = async (month?: string): Promise<ExpenseItem[]> => {
  const params = month ? { month } : {};
  return apiClient.get<ExpenseItem[]>('/api/budget', { params }).then((r) => r.data);
};

export const updateExpense = async (id: number | string, payload: ExpensePayload): Promise<ExpenseItem> =>
  apiClient.put<ExpenseItem>(`/api/budget/${id}`, payload).then((r) => r.data);

export const deleteExpense = async (id: number | string): Promise<void> =>
  apiClient.delete(`/api/budget/${id}`).then(() => undefined);

// ==========================================
// Category Endpoints
// ==========================================
export const getCategories = async (): Promise<Category[]> => {
  const response = await apiClient.get<Category[]>('/api/categories');
  return response.data;
};

export const createCategory = async (name: string): Promise<Category> => {
  const response = await apiClient.post<Category>('/api/categories', { name });
  return response.data;
};

export const getCategoryNames = async (): Promise<string[]> =>
  apiClient.get<Category[]>('/api/categories').then((r) => r.data.map((cat) => cat.name));

export const addCustomCategory = async (categoryName: string): Promise<Category> =>
  apiClient.post<Category>('/api/categories', { name: categoryName }).then((r) => r.data);

// ==========================================
// Transaction Endpoints
// ==========================================
export const getTransactions = async (): Promise<Transaction[]> => {
  const response = await apiClient.get<Transaction[]>('/api/transactions');
  return response.data;
};

export const createTransaction = async (transaction: TransactionPayload): Promise<Transaction> => {
  const response = await apiClient.post<Transaction>('/api/transactions', transaction);
  return response.data;
};

// ==========================================
// Misc Endpoints
// ==========================================
export const getAdvice = async (): Promise<{ advice: string }> => {
  const response = await apiClient.get<{ advice: string }>('/api/ai/advice');
  return response.data;
};

export const submitOnboarding = async (data: any): Promise<any> => {
  const response = await apiClient.post('/api/onboarding', data);
  return response.data;
};

export default apiClient;