#!/usr/bin/env bash
# Render every D-NN-*.mmd in sources/ to a PNG in output/.
# Reuses the mmdc invocation from CIBC_RTA_Demo_May/scripts/build.sh (dark, cloud-neutral).
# Prereq: mmdc (npm i -g @mermaid-js/mermaid-cli). Usage: bash diagrams/render.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/sources"; OUT="$DIR/output"; mkdir -p "$OUT"

command -v mmdc >/dev/null || { echo "mmdc not found: npm i -g @mermaid-js/mermaid-cli"; exit 1; }

shopt -s nullglob
for f in "$SRC"/*.mmd; do
  name="$(basename "$f" .mmd)"
  mmdc -i "$f" -o "$OUT/$name.png" -t dark -b "#080d14" --width 1600 --height 900 2>/dev/null
  echo "[OK] $name.png"
done
