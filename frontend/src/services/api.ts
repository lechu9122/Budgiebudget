import axios, { AxiosInstance } from 'axios';
import type {
  User,
  AuthResponse,
  Category,
  Transaction,
  TransactionPayload,
  BudgetAllocationView,
  BudgetPlanExpense,
  IncomeSource,
  OnboardingPayload,
  OnboardingResponse,
} from '../types';

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

// On 401 (expired/invalid token), clear the session and send the user to login.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRequest = error.config?.url?.includes('/auth/');
    if (error.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/** Extract a human-readable message from any API/axios error. */
export const getApiErrorMessage = (err: unknown, fallback = 'An unexpected error occurred.'): string => {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error || err.message;
  }
  return err instanceof Error ? err.message : fallback;
};

// ==========================================
// Auth Endpoints
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

export type { User, AuthResponse };

export const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/api/auth/register', data);
  return response.data;
};

export const login = async (data: LoginRequest): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/api/auth/login', data);
  return response.data;
};

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

// ==========================================
// Transaction (expense log) Endpoints
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
// Budget Allocation Endpoints (envelope model)
// ==========================================
export const getAllocations = async (month?: number, year?: number): Promise<BudgetAllocationView[]> => {
  const params = month && year ? { month, year } : {};
  const response = await apiClient.get<BudgetAllocationView[]>('/api/allocations', { params });
  return response.data;
};

/** Replace this month's budget plan; validated against stored income. */
export const saveBudgetPlan = async (expenses: BudgetPlanExpense[]): Promise<OnboardingResponse> => {
  const response = await apiClient.post<OnboardingResponse>('/api/allocations', { expenses });
  return response.data;
};

// ==========================================
// Income Endpoints
// ==========================================
export const getIncome = async (): Promise<IncomeSource[]> => {
  const response = await apiClient.get<IncomeSource[]>('/api/income');
  return response.data;
};

/** Replace the user's income sources. */
export const saveIncome = async (income: IncomeSource[]): Promise<void> => {
  await apiClient.post('/api/income', { income });
};

// ==========================================
// Misc Endpoints
// ==========================================
export const getAdvice = async (): Promise<{ advice: string }> => {
  const response = await apiClient.get<{ advice: string }>('/api/ai/advice');
  return response.data;
};

export const submitOnboarding = async (data: OnboardingPayload): Promise<OnboardingResponse> => {
  const response = await apiClient.post<OnboardingResponse>('/api/onboarding', data);
  return response.data;
};

export default apiClient;
