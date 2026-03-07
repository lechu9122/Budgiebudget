# 🦜 BudgieBudget

A personal budget application with an AI assistant, built with a React (TypeScript) frontend and a C++ backend.

---

## Project Structure

```
Budgiebudget/
├── frontend/               # React + TypeScript application
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── AiAdvisor.tsx
│   │   │   ├── BudgetForm.tsx
│   │   │   └── BudgetItemCard.tsx
│   │   ├── pages/          # Route-level page components
│   │   │   ├── Dashboard.tsx
│   │   │   └── Login.tsx
│   │   ├── services/
│   │   │   └── api.ts      # Axios wrapper for the C++ REST API
│   │   ├── types/
│   │   │   └── index.ts    # Shared TypeScript interfaces
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                # C++ REST API server (cpp-httplib + SQLite)
│   ├── include/
│   │   ├── AiAdvisorHandler.h
│   │   ├── AuthHandler.h
│   │   ├── BudgetHandler.h
│   │   └── Database.h
│   ├── src/
│   │   ├── AiAdvisorHandler.cpp
│   │   ├── AuthHandler.cpp
│   │   ├── BudgetHandler.cpp
│   │   ├── Database.cpp
│   │   └── main.cpp
│   └── CMakeLists.txt
│
├── database/
│   └── schema.sql          # SQLite schema (users + budget_items)
│
├── .env.example            # Environment variable template
├── .gitignore
└── README.md
```

---

## Features

| Feature | Status |
|---|---|
| User registration & login (JWT) | ✅ |
| Add / edit / delete budget items | ✅ |
| React dashboard with spending overview | ✅ |
| AI budget advisor (heuristic, extensible to LLM) | ✅ |
| Secure credential handling (.env, gitignored) | ✅ |

---

## Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| CMake | ≥ 3.16 |
| C++ compiler | GCC ≥ 11 or Clang ≥ 14 |
| SQLite3 dev headers | `libsqlite3-dev` (Debian/Ubuntu) |
| OpenSSL dev headers | `libssl-dev` (Debian/Ubuntu) |

### 1 – Configure environment

```bash
cp .env.example .env
# Edit .env and set a strong JWT_SECRET
```

### 2 – Start the backend

```bash
cd backend
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
# Load environment variables and run
export $(grep -v '^#' ../.env | xargs)
./build/budgie_backend
```

The API will be available at `http://localhost:8080`.

### 3 – Start the frontend

```bash
cd frontend
npm install
npm start
```

The React dev server starts on `http://localhost:3000` and proxies `/api` requests to the C++ backend.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | – | Register a new user |
| `POST` | `/api/auth/login` | – | Login, receive JWT |
| `GET` | `/api/budget` | Bearer JWT | List budget items |
| `POST` | `/api/budget` | Bearer JWT | Create budget item |
| `PUT` | `/api/budget/:id` | Bearer JWT | Update budget item |
| `DELETE` | `/api/budget/:id` | Bearer JWT | Delete budget item |
| `GET` | `/api/ai/advice` | Bearer JWT | Get AI spending advice |
| `GET` | `/api/health` | – | Health check |

---

## Security Notes

- Passwords are hashed with SHA-256 before storage. **For production, replace this with bcrypt, scrypt, or Argon2** (these are intentionally slow and include built-in salting, which prevents brute-force and rainbow-table attacks).
- JWTs are signed with HS256 using the `JWT_SECRET` environment variable.
- The `.env` file is listed in `.gitignore` and must **never** be committed.
- All sensitive keys (JWT secret, future LLM API key) must be set via environment variables only.
