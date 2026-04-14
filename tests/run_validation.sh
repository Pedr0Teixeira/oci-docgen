#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# run_validation.sh — OCI DocGen Automated Validation Helper
#
# Runs validate_all.py inside the Docker API container (mirrors production),
# then copies the generated .docx files back to tests/output/ for manual
# inspection. No OCI credentials required.
#
# Usage (from repo root):
#   bash tests/run_validation.sh
#
# Or make it executable once and call directly:
#   chmod +x tests/run_validation.sh
#   ./tests/run_validation.sh
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$SCRIPT_DIR/output"

GREEN='\033[92m'
RED='\033[91m'
YELLOW='\033[93m'
CYAN='\033[96m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${CYAN}▶${RESET} $*"; }
ok()    { echo -e "${GREEN}✓${RESET} $*"; }
error() { echo -e "${RED}✗${RESET} $*" >&2; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }

echo ""
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo -e "${BOLD}  OCI DocGen — Validation Runner${RESET}"
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo ""

# --- Warn if previous documents already exist ----------------------------
EXISTING_DOCS=()
if [[ -d "$OUTPUT_DIR" ]]; then
    while IFS= read -r -d '' f; do
        EXISTING_DOCS+=("$f")
    done < <(find "$OUTPUT_DIR" -maxdepth 1 -name "*.docx" -print0 2>/dev/null)
fi

if [[ ${#EXISTING_DOCS[@]} -gt 0 ]]; then
    echo -e "${YELLOW}${BOLD}⚠  Existing documents found in tests/output/:${RESET}"
    for f in "${EXISTING_DOCS[@]}"; do
        size=$(du -sh "$f" 2>/dev/null | cut -f1)
        echo -e "   ${YELLOW}$(basename "$f")${RESET}  ($size)"
    done
    echo ""
    echo -e "${YELLOW}   Running the validation will overwrite these files.${RESET}"
    echo ""
    # If stdin is a terminal, prompt the user; if piped/non-interactive, proceed automatically
    if [[ -t 0 ]]; then
        read -r -p "   Continue? [Y/n] " REPLY
        REPLY="${REPLY:-Y}"
        if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
            echo ""
            echo "  Aborted."
            echo ""
            exit 0
        fi
    else
        warn "Non-interactive mode — proceeding automatically."
    fi
    echo ""
fi

# --- Check Docker is running and the API container is up ------------------
cd "$REPO_ROOT"

info "Checking Docker environment..."
if ! docker info &>/dev/null; then
    error "Docker is not running. Start Docker and try again."
    exit 1
fi

CONTAINER=$(docker compose ps --format '{{.Name}}' 2>/dev/null | grep '\-api\-' | head -1)
if [[ -z "$CONTAINER" ]]; then
    error "API container is not running. Run 'docker compose up -d' first."
    exit 1
fi
ok "API container is up: $CONTAINER"

# --- Prepare directories inside the container ----------------------------
info "Preparing container workspace..."
docker compose exec api mkdir -p \
    /app/frontend_assets/locales \
    /app/frontend_assets/js \
    /app/test_output

# --- Copy files into the container ---------------------------------------
info "Syncing validation files..."
docker compose cp tests/validate_all.py          api:/app/validate_all.py
docker compose cp frontend/locales/en.json       api:/app/frontend_assets/locales/en.json
docker compose cp frontend/locales/pt.json       api:/app/frontend_assets/locales/pt.json
docker compose cp frontend/js/app.js             api:/app/frontend_assets/js/app.js
docker compose cp frontend/js/diagram.js         api:/app/frontend_assets/js/diagram.js
ok "Files synced"

# --- Run validation -------------------------------------------------------
echo ""
docker compose exec api python /app/validate_all.py
VALIDATION_EXIT=$?
echo ""

# --- Retrieve generated documents ----------------------------------------
info "Copying generated documents to tests/output/..."
mkdir -p "$OUTPUT_DIR"
docker compose cp "api:/app/test_output/." "$OUTPUT_DIR/" 2>/dev/null || true

DOCX_COUNT=$(find "$OUTPUT_DIR" -name "*.docx" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$DOCX_COUNT" -gt 0 ]]; then
    ok "$DOCX_COUNT documents available in $OUTPUT_DIR"
    echo ""
    for f in "$OUTPUT_DIR"/*.docx; do
        size=$(du -sh "$f" 2>/dev/null | cut -f1)
        echo -e "    ${BOLD}$(basename "$f")${RESET}  ($size)"
    done
fi

echo ""
if [[ "$VALIDATION_EXIT" -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}  All checks passed. Documents are ready for manual inspection.${RESET}"
else
    echo -e "${RED}${BOLD}  Some checks failed — review the output above.${RESET}"
fi
echo ""

exit "$VALIDATION_EXIT"
