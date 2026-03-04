import axios, { AxiosInstance } from 'axios';
import {
  AuthCredentials,
  AuthResponse,
  BudgetItem,
  BudgetItemPayload,
  AiAdvice,
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

// --- Auth ---

export const register = (credentials: AuthCredentials): Promise<AuthResponse> =>
  api.post<AuthResponse>('/auth/register', credentials).then((r) => r.data);

export const login = (credentials: AuthCredentials): Promise<AuthResponse> =>
  api.post<AuthResponse>('/auth/login', credentials).then((r) => r.data);

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

// --- AI Advisor ---

export const getAiAdvice = (): Promise<AiAdvice> =>
  api.get<AiAdvice>('/ai/advice').then((r) => r.data);
