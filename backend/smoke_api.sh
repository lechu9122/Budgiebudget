#!/usr/bin/env bash
set -euo pipefail

BASE="http://127.0.0.1:8080"
USER="smoke_$(date +%s)"
PASS="TestPass123"
EMAIL="${USER}@example.com"

echo "user=$USER"

reg=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\",\"email\":\"$EMAIL\"}")
reg_code=$(echo "$reg" | tail -n1)
reg_body=$(echo "$reg" | sed '$d')
echo "register_status=$reg_code"
echo "$reg_body"

token=$(echo "$reg_body" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))' 2>/dev/null || true)

login=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}")
login_code=$(echo "$login" | tail -n1)
login_body=$(echo "$login" | sed '$d')
echo "login_status=$login_code"
echo "$login_body"

if [ -z "$token" ]; then
  token=$(echo "$login_body" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))' 2>/dev/null || true)
fi

if [ -z "$token" ]; then
  echo "token_missing=1"
  exit 1
fi

create_budget=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/budget" \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{"category":"Groceries","description":"Smoke test item","amount":42.50,"date":"2026-03-08"}')
cb_code=$(echo "$create_budget" | tail -n1)
cb_body=$(echo "$create_budget" | sed '$d')
echo "create_budget_status=$cb_code"
echo "$cb_body"

list_budget=$(curl -s -w "\n%{http_code}" -X GET "$BASE/api/budget" \
  -H "Authorization: Bearer $token")
lb_code=$(echo "$list_budget" | tail -n1)
lb_body=$(echo "$list_budget" | sed '$d')
echo "list_budget_status=$lb_code"
echo "$lb_body"
