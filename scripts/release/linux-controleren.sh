#!/usr/bin/env bash
# Controleert de losse OpenPGP-handtekeningen in een map zoals een gebruiker dat
# zou doen: in een lege sleutelring, met alleen de meegeleverde publieke sleutel, die
# de vertrouwde vingerafdruk moet hebben. Elke .deb, .AppImage en SHA256SUMS.txt moet
# een kloppende .asc hebben van die sleutel; een ontbrekende is een fout. Klopt ook
# de inhoud van SHA256SUMS.txt, als die er is.
# Dit is geen ingebedde .deb-handtekening en geen controle van Snap-winkelassertions.
#
# Daarna de server van Open FEM Studio in elke .deb en .AppImage
# (fem-studio/openaec-mcp-server): als hij meegaat, moet hij uitvoerbaar zijn, en in
# de .deb precies de sha256 uit fem-studio/versie.json hebben. Die komt uit de
# SHA256SUMS van FEM Studio, die met dezelfde OpenAEC-sleutel ondertekend is; de
# handtekening van het pakket dekt de rest. Ontbreekt hij, dan is dat een fout als
# FEM_STUDIO_VEREIST=true (de bouw had hem opgehaald), anders een waarschuwing.
# De .AppImage wordt daarvoor uitgepakt met --appimage-extract. Daarin geeft een
# andere sha256 alleen een waarschuwing: het AppImage-gereedschap kan het rpath van
# ELF-bestanden aanpassen, en de .deb uit dezelfde bouw is al streng gecontroleerd.
# Gebruik: scripts/release/linux-controleren.sh <map>
# Omgeving: FEM_STUDIO_VEREIST.
set -euo pipefail
MAP="${1:?map met de pakketten ontbreekt}"
VERTROUWD="$(tr -d '[:space:]' <"$(dirname "$0")/openaec-vingerafdruk.txt")"
VERSIE_JSON="$(cd "$(dirname "$0")/../.." && pwd)/packages/desktop/src-tauri/fem-studio/versie.json"
SLEUTEL="$MAP/openaec-release-key.asc"
test -f "$SLEUTEL" || { echo "::error::openaec-release-key.asc ontbreekt in $MAP" >&2; exit 1; }

export GNUPGHOME
GNUPGHOME="$(mktemp -d)"
chmod 700 "$GNUPGHOME"
UITPAK="$(mktemp -d)"
trap 'gpgconf --kill gpg-agent || true; rm -rf "$GNUPGHOME" "$UITPAK"' EXIT

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

FEM_SHA="$(node -p 'require(process.argv[1]).bestanden?.["linux-x64"]?.sha256?.toLowerCase() ?? ""' "$VERSIE_JSON")"
# Zoekt de server onder een uitgepakt pakket en controleert hem. Met streng=nee is
# een andere sha256 alleen een waarschuwing.
controleer_fem_server() {
  local label="$1" wortel="$2" streng="${3:-ja}" server sha
  mapfile -t GEVONDEN < <(find "$wortel" -type f -path '*/fem-studio/openaec-mcp-server')
  if [ "${#GEVONDEN[@]}" -eq 0 ]; then
    if [ "${FEM_STUDIO_VEREIST:-false}" = true ]; then
      echo "::error::FEM Studio ontbreekt in $label, maar de bouw had hem opgehaald" >&2
      exit 1
    fi
    echo "::warning::FEM Studio is niet meegeleverd in $label"
    UITVOER+="- \`$label\`: FEM Studio niet meegeleverd"$'\n'
    return
  fi
  test "${#GEVONDEN[@]}" -eq 1 || { echo "::error::meer dan één FEM-server in $label" >&2; exit 1; }
  server="${GEVONDEN[0]}"
  test -x "$server" || { echo "::error::de FEM-server in $label is niet uitvoerbaar" >&2; exit 1; }
  test -n "$FEM_SHA" || { echo "::error::$label bevat een FEM-server, maar versie.json heeft geen linux-x64" >&2; exit 1; }
  sha="$(sha256sum "$server" | cut -d' ' -f1)"
  if [ "$sha" != "$FEM_SHA" ]; then
    if [ "$streng" = ja ]; then
      echo "::error::de FEM-server in $label heeft niet de sha256 uit versie.json" >&2
      exit 1
    fi
    echo "::warning::de FEM-server in $label heeft een andere sha256 dan versie.json ($sha)"
    UITVOER+="- \`$label\`: FEM-server \`${server#"$wortel"/}\`, uitvoerbaar, sha256 wijkt af van versie.json"$'\n'
    return
  fi
  echo "in orde: FEM-server in $label"
  UITVOER+="- \`$label\`: FEM-server \`${server#"$wortel"/}\`, sha256 gelijk aan versie.json"$'\n'
}

for deb in "${DEB[@]}"; do
  doel="$UITPAK/deb"
  dpkg-deb -x "$deb" "$doel"
  controleer_fem_server "$(basename "$deb")" "$doel"
  rm -rf "$doel"
done
for appimage in "${APPIMAGE[@]}"; do
  doel="$UITPAK/appimage"
  mkdir -p "$doel"
  install -m 755 "$appimage" "$doel/pakket.AppImage"
  (cd "$doel" && ./pakket.AppImage --appimage-extract >/dev/null)
  controleer_fem_server "$(basename "$appimage")" "$doel/squashfs-root" nee
  rm -rf "$doel"
done

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
