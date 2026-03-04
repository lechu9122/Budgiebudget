/** Represents a registered user returned by the API. */
export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

/** Represents a single budget line item. */
export interface BudgetItem {
  id: number;
  user_id: number;
  category: string;
  description: string;
  amount: number;
  /** ISO 8601 date string, e.g. "2024-03-01" */
  date: string;
  created_at: string;
  updated_at: string;
}

/** Payload for creating or updating a budget item. */
export interface BudgetItemPayload {
  category: string;
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
