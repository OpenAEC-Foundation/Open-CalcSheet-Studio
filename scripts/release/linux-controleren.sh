#!/usr/bin/env bash
# Controleert de losse OpenPGP-handtekeningen in een map zoals een gebruiker dat
# zou doen: in een lege sleutelring, met alleen de meegeleverde publieke sleutel, die
# de vertrouwde vingerafdruk moet hebben. Elke .deb, .AppImage en SHA256SUMS.txt moet
# een kloppende .asc hebben van die sleutel; een ontbrekende is een fout. Klopt ook
# de inhoud van SHA256SUMS.txt, als die er is.
# Dit is geen ingebedde .deb-handtekening en geen controle van Snap-winkelassertions.
# Gebruik: scripts/release/linux-controleren.sh <map>
set -euo pipefail
MAP="${1:?map met de pakketten ontbreekt}"
VERTROUWD="$(tr -d '[:space:]' <"$(dirname "$0")/openaec-vingerafdruk.txt")"
SLEUTEL="$MAP/openaec-release-key.asc"
test -f "$SLEUTEL" || { echo "::error::openaec-release-key.asc ontbreekt in $MAP" >&2; exit 1; }

export GNUPGHOME
GNUPGHOME="$(mktemp -d)"
chmod 700 "$GNUPGHOME"
trap 'gpgconf --kill gpg-agent || true; rm -rf "$GNUPGHOME"' EXIT

# Precies één sleutel, en de juiste: de vingerafdruk is het vertrouwensanker.
PRIMAIR="$(gpg --batch --with-colons --show-keys "$SLEUTEL" | awk -F: '$1=="pub" {pub=1; next} pub && $1=="fpr" {print $10; pub=0}')"
if [ "$PRIMAIR" != "$VERTROUWD" ]; then
  echo "::error::de publieke sleutel in $MAP heeft niet de vertrouwde vingerafdruk" >&2
  exit 1
fi
gpg --batch --quiet --import "$SLEUTEL"

shopt -s nullglob
DEB=("$MAP"/*.deb)
APPIMAGE=("$MAP"/*.AppImage)
test "${#DEB[@]}" -ge 1 || { echo "::error::geen .deb in $MAP" >&2; exit 1; }
test "${#APPIMAGE[@]}" -ge 1 || { echo "::error::geen .AppImage in $MAP" >&2; exit 1; }

UITVOER=""
for bestand in "${DEB[@]}" "${APPIMAGE[@]}" "$MAP"/SHA256SUMS.tx[t]; do
  naam="$(basename "$bestand")"
  test -f "$bestand.asc" || { echo "::error::handtekening ontbreekt: $naam.asc" >&2; exit 1; }
  STATUS="$(gpg --batch --status-fd 1 --verify "$bestand.asc" "$bestand" 2>/dev/null)" \
    || { echo "::error::handtekening klopt niet: $naam" >&2; exit 1; }
  # GOODSIG alleen bij een geldige sleutel: verlopen of ingetrokken geeft een ander statuswoord.
  grep -q '^\[GNUPG:\] GOODSIG ' <<<"$STATUS" || { echo "::error::geen geldige handtekening: $naam" >&2; exit 1; }
  HOOFD="$(awk '$2=="VALIDSIG" {print $NF}' <<<"$STATUS")"
  test "$HOOFD" = "$VERTROUWD" || { echo "::error::$naam is met een andere sleutel getekend" >&2; exit 1; }
  echo "in orde: $naam"
  UITVOER+="- \`$naam\`: geldige losse handtekening"$'\n'
done

if [ -f "$MAP/SHA256SUMS.txt" ]; then
  (cd "$MAP" && sha256sum --check --strict SHA256SUMS.txt)
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Linux"
    echo
    echo "Vingerafdruk: \`$VERTROUWD\`"
    echo
    printf '%s' "$UITVOER"
  } >>"$GITHUB_STEP_SUMMARY"
fi
echo "Linux-handtekeningen in orde."
