#!/usr/bin/env bash
# Zet de artifacts van de bouw klaar als releasebestanden. Spaties worden punten, zoals
# GitHub dat bij het uploaden toch doet; zo kloppen de namen in SHA256SUMS.txt met de
# downloads. Faalt als er iets ontbreekt, te veel is of een ander versienummer draagt.
# Gebruik: scripts/release/assets-klaarzetten.sh <artifact-map> <uitvoermap> <versie>
set -euo pipefail
BRON="${1:?map met artifacts ontbreekt}"
DOEL="${2:?uitvoermap ontbreekt}"
VERSIE="${3:?versie ontbreekt}"

mkdir -p "$DOEL"
shopt -s nullglob
for bestand in "$BRON"/*; do
  test -f "$bestand" || { echo "::error::onverwachte map in de artifacts: $bestand" >&2; exit 1; }
  cp "$bestand" "$DOEL/$(basename "$bestand" | tr ' ' '.')"
done

# Precies wat een release hoort te bevatten, niets meer en niets minder.
VERWACHT=(
  "_${VERSIE}_x64-setup.exe"
  "_${VERSIE}_x64_user-setup.exe"
  "_${VERSIE}_universal.dmg"
  "_${VERSIE}_amd64.deb"
  "_${VERSIE}_amd64.deb.asc"
  "_${VERSIE}_amd64.AppImage"
  "_${VERSIE}_amd64.AppImage.asc"
)
for einde in "${VERWACHT[@]}"; do
  GEVONDEN=("$DOEL"/*"$einde")
  test "${#GEVONDEN[@]}" -eq 1 || { echo "::error::verwachtte 1 bestand op *$einde, vond er ${#GEVONDEN[@]}" >&2; exit 1; }
done
test -f "$DOEL/openaec-release-key.asc" || { echo "::error::openaec-release-key.asc ontbreekt" >&2; exit 1; }
AANTAL="$(find "$DOEL" -maxdepth 1 -type f | wc -l)"
if [ "$AANTAL" -ne $((${#VERWACHT[@]} + 1)) ]; then
  echo "::error::onverwachte bestanden tussen de artifacts:" >&2
  ls -1 "$DOEL" >&2
  exit 1
fi

# Eerst naar een tijdelijk bestand: anders telt de lijst zichzelf mee.
LIJST="$(mktemp)"
(
  cd "$DOEL"
  find . -maxdepth 1 -type f -printf '%f\0' | LC_ALL=C sort -z | xargs -0 sha256sum >"$LIJST"
)
mv "$LIJST" "$DOEL/SHA256SUMS.txt"
chmod 644 "$DOEL/SHA256SUMS.txt"
cat "$DOEL/SHA256SUMS.txt"
