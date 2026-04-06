#!/bin/sh
#
# Pre-commit hook: detect and auto-fix missing Copyright/License headers
# in staged .vue / .js / .ts files under llm-eval-viewer/src/.
# Install: cp scripts/format/check-license.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#

RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

YEAR=$(date +%Y)
VUE_HEADER="<!-- Copyright (c) ${YEAR} dynamicheart. Licensed under the MIT License. -->"
JS_HEADER="/* Copyright (c) ${YEAR} dynamicheart. Licensed under the MIT License. */"

MISSING=""

for file in $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(vue|js|ts)$' | grep '^llm-eval-viewer/src/'); do
  if ! head -5 "$file" | grep -q "Copyright"; then
    MISSING="$MISSING\n  $file"
  fi
done

if [ -z "$MISSING" ]; then
  exit 0
fi

echo "${YELLOW}The following staged files are missing a Copyright header:${NC}"
echo "$MISSING"
echo ""

# Interactive: ask for confirmation; non-interactive: auto-add
if [ -t 0 ]; then
  printf "Auto-add header (year=${YEAR}) and continue commit? [Y/n] "
  read -r REPLY
  if [ "$REPLY" = "n" ] || [ "$REPLY" = "N" ]; then
    echo "Commit aborted. Please add headers manually."
    exit 1
  fi
else
  echo "Non-interactive mode: auto-adding headers (year=${YEAR})."
fi

for file in $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(vue|js|ts)$' | grep '^llm-eval-viewer/src/'); do
  if ! head -5 "$file" | grep -q "Copyright"; then
    case "$file" in
      *.vue) HEADER="$VUE_HEADER" ;;
      *)     HEADER="$JS_HEADER" ;;
    esac
    { echo "$HEADER"; echo ""; cat "$file"; } > "$file.tmp" && mv "$file.tmp" "$file"
    git add "$file"
    echo "  + $file"
  fi
done

echo "${YELLOW}Headers added. Proceeding with commit.${NC}"
exit 0
