#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
die() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

echo "Pre-commit checks"
echo "------------------"

if [ ! -f "index.html" ]; then
  die "index.html missing"
else
  ok "index.html exists"
fi

if grep -q 'bootstrapHarness' index.html 2>/dev/null; then
  ok "index.html references bootstrapHarness"
else
  die "index.html does not reference bootstrapHarness"
fi

JS_FILES=$(find src -name '*.js' -type f 2>/dev/null || true)
if [ -z "$JS_FILES" ]; then
  die "No JS files found under src/"
else
  ok "JS source files found ($(echo "$JS_FILES" | wc -l | tr -d ' ') files)"
fi

IMPORT_ERRORS=0
while IFS= read -r f; do
  REL="${f#$ROOT/}"
  IMPORTS=$(grep -oE "from ['\"]\.([^'\"]+)['\"]" "$f" 2>/dev/null || true)
  while IFS= read -r imp; do
    [ -z "$imp" ] && continue
    MOD=$(echo "$imp" | sed "s/.*from ['\"]//;s/['\"].*//")
    DIR=$(dirname "$f")
    RESOLVED="$DIR/$MOD"
    if [ ! -f "$RESOLVED" ] && [ ! -f "${RESOLVED}.js" ]; then
      die "Broken import in $REL: $MOD"
      IMPORT_ERRORS=$((IMPORT_ERRORS + 1))
    fi
  done <<< "$IMPORTS"
done <<< "$JS_FILES"

if [ "$IMPORT_ERRORS" -eq 0 ]; then
  ok "All ES module imports resolve"
fi

SYNTAX_ERRORS=0
while IFS= read -r f; do
  REL="${f#$ROOT/}"
  if node --check "$f" 2>&1; then
    :
  else
    die "Syntax error in $REL"
    SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
  fi
done <<< "$JS_FILES"

if [ "$SYNTAX_ERRORS" -eq 0 ]; then
  ok "All JS files pass syntax check"
fi

echo "------------------"
TOTAL=$((PASS + FAIL))
echo "$PASS/$TOTAL passed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
