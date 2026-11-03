#!/usr/bin/env bash
# Notariseert en staplet de dmg zelf. Tauri doet dat alleen voor de app; de dmg
# eromheen bouwt het daarna en ondertekent het alleen.
# Gebruik: scripts/release/macos-notariseren.sh <map-met-dmg>
# Omgeving: APPLE_API_KEY (sleutel-ID), APPLE_API_ISSUER, APPLE_API_KEY_PATH (.p8-bestand).
set -euo pipefail
MAP="${1:?map met de dmg ontbreekt}"
: "${APPLE_API_KEY:?}" "${APPLE_API_ISSUER:?}" "${APPLE_API_KEY_PATH:?}"
DMG="$(find "$MAP" -maxdepth 1 -name '*.dmg' -print -quit)"
test -n "$DMG" || { echo "::error::geen dmg in $MAP" >&2; exit 1; }
AUTH=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
LOG="$(mktemp)"

echo "dmg notariseren: $DMG"
# Oordeel op de status, niet op de exitcode van notarytool.
xcrun notarytool submit "$DMG" "${AUTH[@]}" --wait 2>&1 | tee "$LOG" || true
if ! grep -qE '^ *status: Accepted' "$LOG"; then
  ID="$(awk '/^ *id: /{print $2; exit}' "$LOG")"
  echo "::error::notarisatie van de dmg niet geaccepteerd" >&2
  if [ -n "$ID" ]; then xcrun notarytool log "$ID" "${AUTH[@]}" || true; fi
  exit 1
fi
xcrun stapler staple "$DMG"
echo "dmg genotariseerd en ticket vastgeniet"
