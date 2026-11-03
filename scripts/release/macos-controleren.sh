#!/usr/bin/env bash
# Controleert wat een macOS-gebruiker echt krijgt: de dmg en de app die erin zit.
# Handtekening, Developer ID van het juiste team, hardened runtime, tijdstempel,
# beide processorarchitecturen, Gatekeeper en een vastgeniet notarisatieticket.
# Ad-hoc ondertekend is dus niet genoeg.
# Gebruik: scripts/release/macos-controleren.sh <map-met-dmg>
# Omgeving: APPLE_TEAM_ID.
set -euo pipefail
MAP="${1:?map met de dmg ontbreekt}"
: "${APPLE_TEAM_ID:?geheim APPLE_TEAM_ID ontbreekt}"

shopt -s nullglob
DMGS=("$MAP"/*.dmg)
test "${#DMGS[@]}" -eq 1 || { echo "::error::verwachtte 1 dmg in $MAP, vond er ${#DMGS[@]}" >&2; exit 1; }
DMG="${DMGS[0]}"
echo "dmg: $DMG"

codesign --verify --strict --verbose=2 "$DMG"
UITSLAG_DMG="$(spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG" 2>&1)" \
  || { echo "$UITSLAG_DMG" >&2; echo "::error::Gatekeeper weigert de dmg" >&2; exit 1; }
echo "$UITSLAG_DMG"
grep -q 'source=Notarized Developer ID' <<<"$UITSLAG_DMG" || { echo "::error::dmg is niet genotariseerd" >&2; exit 1; }
xcrun stapler validate "$DMG"

KOPPEL="$(mktemp -d)"
WERK="${RUNNER_TEMP:-$(mktemp -d)}/calc-app-controle"
opruimen() {
  hdiutil detach "$KOPPEL" >/dev/null 2>&1 || true
  rm -rf "$KOPPEL" "$WERK"
}
trap opruimen EXIT
hdiutil attach -nobrowse -readonly -mountpoint "$KOPPEL" "$DMG" >/dev/null
APPS=("$KOPPEL"/*.app)
test "${#APPS[@]}" -eq 1 || { echo "::error::verwachtte 1 app in de dmg, vond er ${#APPS[@]}" >&2; exit 1; }
mkdir -p "$WERK"
APP="$WERK/$(basename "${APPS[0]}")"
ditto "${APPS[0]}" "$APP"
hdiutil detach "$KOPPEL" >/dev/null

codesign --verify --deep --strict --verbose=2 "$APP"

GEGEVENS="$(codesign -dv --verbose=4 "$APP" 2>&1)"
echo "$GEGEVENS" | grep -E '^(Authority|TeamIdentifier|Timestamp|flags)=|flags=' || true
grep -q '^Authority=Developer ID Application' <<<"$GEGEVENS" || { echo "::error::app is niet met een Developer ID ondertekend" >&2; exit 1; }
grep -q "^TeamIdentifier=${APPLE_TEAM_ID}\$" <<<"$GEGEVENS" || { echo "::error::app is door een ander team ondertekend" >&2; exit 1; }
grep -q '^Timestamp=' <<<"$GEGEVENS" || { echo "::error::app heeft geen beveiligde tijdstempel" >&2; exit 1; }
grep -Eq 'flags=0x[0-9a-f]+\([^)]*runtime[^)]*\)' <<<"$GEGEVENS" || { echo "::error::app heeft geen hardened runtime" >&2; exit 1; }

UITSLAG_APP="$(spctl --assess --type execute --verbose=4 "$APP" 2>&1)" \
  || { echo "$UITSLAG_APP" >&2; echo "::error::Gatekeeper weigert de app" >&2; exit 1; }
echo "$UITSLAG_APP"
grep -q 'source=Notarized Developer ID' <<<"$UITSLAG_APP" || { echo "::error::app is niet genotariseerd" >&2; exit 1; }
xcrun stapler validate "$APP"

BINAIR="$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
ARCHS="$(lipo -archs "$BINAIR")"
echo "architecturen: $ARCHS"
for arch in x86_64 arm64; do
  grep -qw "$arch" <<<"$ARCHS" || { echo "::error::$arch ontbreekt in het programma" >&2; exit 1; }
done

echo "rechten (entitlements) van de app:"
codesign -d --entitlements - "$APP" 2>/dev/null || true

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## macOS"
    echo
    echo "- \`$(basename "$DMG")\`: Developer ID, genotariseerd, ticket vastgeniet"
    echo "- \`$(basename "$APP")\`: Developer ID, hardened runtime, genotariseerd, ticket vastgeniet ($ARCHS)"
  } >>"$GITHUB_STEP_SUMMARY"
fi
echo "macOS-handtekening en notarisatie in orde (dmg en app)."
