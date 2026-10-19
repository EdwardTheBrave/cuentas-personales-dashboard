#!/usr/bin/env bash
# Revisa los ficheros que se van a subir (o todos los versionados con --all) y falla si encuentra:
#   - ficheros de configuración o datos personales (config.local.js, hojas de cálculo fuera de sample/)
#   - IDs de Google Sheet rellenos, emails, tokens o claves con formato conocido
#   - cualquier término de .secret-terms (fichero local, ignorado por git: un término por línea)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [[ "${1:-}" == "--all" ]]; then
  files=$(git ls-files)
else
  files=$(git diff --cached --name-only --diff-filter=ACMR)
fi
[[ -z "$files" ]] && exit 0

fail=0
report() { echo "✖ $1"; fail=1; }

while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  case "$f" in
    config.local.js|.secret-terms|.env*|dist/*|entrega/*) report "$f no debe subirse";;
    sample/ejemplo-cuentas.xlsx|sample/plantilla-cuentas.xlsx) ;;
    *.xlsx|*.xls|*.ods|*.csv) report "$f: hoja de cálculo fuera de sample/";;
  esac
done <<< "$files"

# Patrones genéricos (se excluye este script, que los contiene).
text_files=$(echo "$files" | grep -v -E '^scripts/check-secrets\.sh$|\.xlsx$|^package-lock\.json$' || true)
if [[ -n "$text_files" ]]; then
  patterns=(
    "sheetId:[[:space:]]*'[A-Za-z0-9_-]{20,}'"
    "docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]{20,}"
    "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    "gh[pousr]_[A-Za-z0-9]{20,}"
    "sk-[A-Za-z0-9_-]{20,}"
    "AKIA[0-9A-Z]{16}"
    "AIza[0-9A-Za-z_-]{30,}"
    "-----BEGIN [A-Z ]*PRIVATE KEY-----"
  )
  for p in "${patterns[@]}"; do
    hits=$(echo "$text_files" | tr '\n' '\0' | xargs -0 grep -n -I -E -- "$p" 2>/dev/null | grep -v -E 'noreply@anthropic\.com' || true)
    [[ -n "$hits" ]] && report "patrón sensible ($p):
$hits"
  done
  if [[ -f .secret-terms ]]; then
    while IFS= read -r term; do
      [[ -z "$term" || "$term" == \#* ]] && continue
      hits=$(echo "$text_files" | tr '\n' '\0' | xargs -0 grep -n -I -i -F -- "$term" 2>/dev/null || true)
      [[ -n "$hits" ]] && report "término privado de .secret-terms encontrado:
$hits"
    done < .secret-terms
  fi
fi

if [[ $fail -ne 0 ]]; then
  echo "Commit bloqueado: revisa lo anterior."; exit 1
fi
echo "✔ Sin datos personales ni secretos en $(echo "$files" | wc -l | tr -d ' ') ficheros."
