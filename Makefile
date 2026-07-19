# BudgieBudget — one-command startup.
#
#   make start     start database + backend + frontend (Ctrl+C stops everything)
#   make backend   start only the C++ backend (builds it first)
#   make frontend  start only the React dev server
#   make build     build the C++ backend
#   make db        ensure PostgreSQL is running and the budgie database exists

BACKEND_BUILD = backend/build

.PHONY: start backend frontend build db deps

## Ensure PostgreSQL is running and the budgie database exists
db:
	@pg_isready -h localhost >/dev/null 2>&1 || brew services start postgresql@18
	@i=0; until pg_isready -h localhost >/dev/null 2>&1 || [ $$i -ge 15 ]; do i=$$((i+1)); sleep 1; done
	@psql -h localhost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='budgie'" | grep -q 1 \
		|| createdb -h localhost budgie
	@echo "PostgreSQL ready (database: budgie)"

## Build the C++ backend
build:
	@cmake -S backend -B $(BACKEND_BUILD) -DCMAKE_BUILD_TYPE=Release
	@cmake --build $(BACKEND_BUILD) --parallel

## Install frontend dependencies if missing
deps:
	@[ -d frontend/node_modules ] || (cd frontend && npm install)

## Start everything: database, backend (:8080), frontend (:3003)
start: db build deps
	@echo "Starting BudgieBudget — backend on :8080, frontend on :3003 (Ctrl+C stops both)"
	@trap 'kill 0' INT TERM; \
	backend/run_backend_raw.sh & \
	( cd frontend && npm start ) & \
	wait

## Backend only
backend: db build
	backend/run_backend_raw.sh

## Frontend only
frontend: deps
	cd frontend && npm start
