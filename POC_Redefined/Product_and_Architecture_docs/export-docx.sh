#!/usr/bin/env bash
# Export each Volume-*/ markdown chapter to DOCX + bundle the diagrams it references.
# Output: Product_and_Architecture_docs_DOCX/Volume-N/ { *.docx, referenced D-NN PNGs }
# pandoc runs from inside each volume dir so `../diagrams/output/*.png` links resolve
# and get embedded in the .docx. Prereq: pandoc. Usage: bash export-docx.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/Product_and_Architecture_docs_DOCX"
command -v pandoc >/dev/null || { echo "pandoc missing: brew install pandoc"; exit 1; }

shopt -s nullglob
for vol in "$DIR"/Volume-*/; do
  name="$(basename "$vol")"
  dest="$OUT/$name"; mkdir -p "$dest"
  for md in "$vol"*.md; do
    base="$(basename "$md" .md)"
    ( cd "$vol" && pandoc "$(basename "$md")" --toc --toc-depth=2 -o "$dest/$base.docx" )
    echo "[DOCX] $name/$base.docx"
  done
  # bundle every diagram the volume references (by D-NN id, deduped)
  ids="$(grep -hoE 'D-[0-9]{2}' "$vol"*.md | sort -u || true)"
  for id in $ids; do
    for png in "$DIR"/diagrams/output/$id-*.png; do cp "$png" "$dest/"; done
  done
  echo "[PNG ] $name: $(echo $ids | tr '\n' ' ')"
done
echo "Done -> $OUT"
