# Het rapport als bladen

## Doel

Het constructierapport is nu een eigen soort knoop met een vast formulier (hoofdstuk 1 tot en
met 5, voorblad, revisies, bureau). Dat wordt hetzelfde als elk ander blad: code, invoer en
uitdraai. Een hoofdstuk is een module, zoals de balklaag een module is. Zo kan een bureau zijn
rapport zelf vormgeven, met eigen hoofdstukken en teksten, en kan elk stuk van het rapport net
zo worden aangepast als een rekenblad.

## Uitgangspunten

- **Eén soort blad.** Voorblad, revisies, inleiding, projectgegevens, constructie,
  uitgangspunten, belastingen en bureau worden bladen met rekentekst. Het formulier dat er nu
  staat, wordt het invoerscherm van dat blad (zoals de lastblokken van 5.5 nu al een canvas
  zijn).
- **Modules.** Elk hoofdstuk staat in de modulecatalogus ("Rapport – Belastingen"). Een set
  hoofdstukken is het rapportsjabloon van een bureau; een ander bureau maakt zijn eigen set.
- **Het rapport is de volgorde van de bladen.** De projectboom bepaalt de volgorde. Elk blad
  heeft een plek: een hoofdstuk, een paragraaf onder een hoofdstuk, of bijlage A.
- **Altijd zien waar je zit.** In de uitdraai van elk blad staat vast bovenaan waar het in het
  rapport komt ("Rapport › 5.4 Overige veranderlijke belastingen · pagina 12–13"). Het
  voorbeeld rechts toont de echte rapportpagina's, met die van dit blad gemarkeerd.
- **Globale variabelen.** Wat het rapport nu aan elk blad geeft (`g_v1`, `q_k1`), geeft een
  blad met `#global` (gebouwd in deze stap, zie hieronder). Het belastingenblad zet zijn
  symbolen in een `#global`-blok.

## `#global` (stap 1, gebouwd)

```
#global
g_v1 = 0,43 kN/m²
q_k1 = ?{2,5} kN/m²
#end global

#global ψ_0 = 0,7
```

- In het blad zelf rekent en toont alles gewoon.
- Wat erbinnen wordt toegekend, gaat als rekentekst in de projecttekst, die vóór elk blad
  rekent. Elk blad kent de naam en mag hem overschrijven.
- De bladen rekenen in de volgorde van de projectboom. Een blad met `#global` kent de globale
  variabelen van de bladen erboven, niet die eronder. Zo kan er geen kring ontstaan, en het
  volgt de leesvolgorde van het rapport.
- Twee bladen met dezelfde naam: de onderste geldt.
- Alleen getallen en grootheden met een eenheid. Een functie, matrix of tekst heeft geen
  vorm als losse rekenregel en wordt overgeslagen.
- Code: `packages/core/src/globaal.ts`, `packages/desktop/src/rekenen/globalen.ts`,
  `projectTekstVan` in `store/projectBlad.ts`. Controle: `scripts/check-globalen.mjs`.

Nog niet: een overzicht van de globale variabelen met hun herkomst (de gegevens zijn er al:
`Globalen.herkomst`, `dubbel`, `overgeslagen`), en `#global` in een `#include`-bestand.

## Volgende stappen

1. **Plek in het rapport per blad**, met de vaste aanduiding in de uitdraai en de gemarkeerde
   pagina's in het voorbeeld. Werkt meteen voor de rekenbladen in bijlage A.
2. **Belastingen als blad.** Hoofdstuk 5 wordt een module met rekentekst; de lastblokken en
   klassen worden het invoerscherm, de symbolen een `#global`-blok. Een oud project krijgt bij
   het openen zo'n blad met dezelfde waarden en symbolen.
3. **De andere hoofdstukken** (1 tot en met 4) als modules, met hun teksten als rekentekst.
4. **Voorblad, revisies en bureau** als bladen. Het rapport-object in het projectbestand
   houdt daarna alleen nog wat geen blad is (taal van het rapport).
5. **Rapportsjabloon van een bureau** als set modules in de bibliotheek.

Elke stap is een eigen pull request. Een oud project wordt bij het openen omgezet en gaat
niet verloren: de omzetting heeft een controlescript met een bestaand projectbestand.

## Open punten

- Hoe een blad aangeeft dat het een hoofdstuk is (een kopregel in de rekentekst, of een
  eigenschap van het blad die de projectboom zet).
- Of de inhoudsopgave een eigen blad wordt of uit de koppen van de bladen volgt.
