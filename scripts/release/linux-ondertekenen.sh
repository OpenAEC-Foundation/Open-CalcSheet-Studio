#!/usr/bin/env bash
# Losse OpenPGP-handtekeningen (.asc) met de bestaande OpenAEC-releasesleutel, voor
# elke .deb, .AppImage en SHA256SUMS.txt in de map die er nog geen heeft, plus de
# publieke sleutel als openaec-release-key.asc. De vertrouwde vingerafdruk staat in
# openaec-vingerafdruk.txt; een andere sleutel wordt geweigerd.
# Gebruik: scripts/release/linux-ondertekenen.sh <map>
# Omgeving: OPENAEC_GPG_PRIVATE_KEY, OPENAEC_GPG_PASSPHRASE, OPENAEC_GPG_FINGERPRINT.
set -euo pipefail
MAP="${1:?map met de pakketten ontbreekt}"
# Alleen namen in een melding, nooit waarden.
for naam in OPENAEC_GPG_PRIVATE_KEY OPENAEC_GPG_PASSPHRASE OPENAEC_GPG_FINGERPRINT; do
  test -n "${!naam:-}" || { echo "::error::geheim of variabele $naam ontbreekt" >&2; exit 1; }
done

VERTROUWD="$(tr -d '[:space:]' <"$(dirname "$0")/openaec-vingerafdruk.txt")"
OPGEGEVEN="$(printf '%s' "$OPENAEC_GPG_FINGERPRINT" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')"
if [ "$OPGEGEVEN" != "$VERTROUWD" ]; then
  echo "::error::OPENAEC_GPG_FINGERPRINT wijkt af van scripts/release/openaec-vingerafdruk.txt" >&2
  exit 1
fi

export GNUPGHOME
GNUPGHOME="$(mktemp -d)"
chmod 700 "$GNUPGHOME"
trap 'gpgconf --kill gpg-agent || true; rm -rf "$GNUPGHOME"' EXIT

printf '%s' "$OPENAEC_GPG_PRIVATE_KEY" | gpg --batch --quiet --import
WERKELIJK="$( (gpg --batch --with-colons --list-secret-keys "$VERTROUWD" 2>/dev/null || true) | awk -F: '$1=="fpr" {print $10; exit}')"
if [ "$WERKELIJK" != "$VERTROUWD" ]; then
  echo "::error::de geheime sleutel hoort niet bij de vertrouwde vingerafdruk" >&2
  exit 1
fi

shopt -s nullglob
GETEKEND=0
for bestand in "$MAP"/*.deb "$MAP"/*.AppImage "$MAP"/SHA256SUMS.tx[t]; do
  if [ -f "$bestand.asc" ]; then continue; fi
  printf '%s' "$OPENAEC_GPG_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
    --local-user "$VERTROUWD" --armor --detach-sign --output "$bestand.asc" "$bestand"
  echo "getekend: $(basename "$bestand")"
  GETEKEND=$((GETEKEND + 1))
done
if [ "$GETEKEND" -eq 0 ]; then
  echo "::error::niets te tekenen in $MAP" >&2
  exit 1
fi

if [ ! -f "$MAP/openaec-release-key.asc" ]; then
  gpg --batch --armor --export "$VERTROUWD" >"$MAP/openaec-release-key.asc"
fi
