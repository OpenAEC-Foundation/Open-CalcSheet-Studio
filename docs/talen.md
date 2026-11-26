# Talen

De app spreekt Engels, Nederlands en Litouws. Engels is de bron: elke tekst bestaat in
het Engels, elke andere taal is een vertaling. Ontbreekt een vertaling, dan staat er
Engels.

Een rapport heeft een eigen taal (`rapport.taal`). Een nieuw rapport neemt de taal van
de app over; in het rapportpaneel kies je een andere. Wisselen zet wat de app meelevert
in de nieuwe taal en laat eigen tekst staan; het paneel meldt welke teksten nog in een
andere taal staan (`rapport/taalwissel.ts`).

## Waar de teksten staan

Alles staat in `packages/desktop/src/i18n/locales/<taal>/`, één bestand per namespace:

| Bestand | Wat |
|---|---|
| `common.json`, `ribbon.json`, `backstage.json`, `settings.json`, `feedback.json` | de schil van de app |
| `werkruimte.json`, `rekentaal.json`, `beelden.json`, `tekenen.json`, `library.json`, `gewichten.json` | de onderdelen van de app |
| `rapport.json` | het rapportpaneel en de vaste woorden op papier |
| `rapportteksten.json` | wat het rapport meelevert: de koppen, de standaardwaarden en suggesties, de standaardteksten met hun label, de labels van de normwaarden en de korte gewichtenlijst |

De code noemt alleen sleutels. Voor de schil is dat `t("…")` van i18next; voor de
meegeleverde inhoud van het rapport `mt("koppen.inleiding")` (`rapport/meertalig.ts`),
die de tekst in elke taal uit het register van `i18n/talen.ts` haalt.

## Een taal toevoegen

1. Kopieer `locales/en/` naar `locales/<code>/`, met de taalcode als naam (`de`, `fr`, `pt-BR`).
2. Vertaal de waarden. Laat de sleutels, `{{…}}` en `{…}` (invulvelden), HTML en code
   staan. Een lijst in `rapportteksten.json` houdt zijn lengte en volgorde.
3. Meervouden volgen de regels van de taal (`Intl.PluralRules`): staat er in het Engels
   `x_one` en `x_other`, schrijf dan alle vormen van de nieuwe taal, bijvoorbeeld
   `x_one`, `x_few`, `x_many` en `x_other` in het Litouws.
4. Zet één regel in `TALEN` in `i18n/talen.ts`: de code, de naam van de taal in die taal,
   of de taal een decimale komma schrijft, en de landcode voor datums.

Meer hoeft niet. De taal staat daarna in de keuzelijst bij Instellingen en in het
rapportpaneel; `i18n/bundels.ts` vindt de map vanzelf, en in Node doet
`scripts/lib/talen.mjs` dat.

## Controleren

- `node scripts/check-schermtekst.mjs` meldt per taal uit de lijst elke sleutel die
  ontbreekt of te veel is, en Nederlandse woorden in een andere taal dan het Nederlands.
- `node scripts/check-rapport-talen.mjs` controleert per taal of elke meegeleverde tekst
  van het rapport vertaald is, of wisselen heen en terug klopt, of de getallen de notatie
  van de taal hebben, en zet een compleet rapport in die taal op papier om het te
  doorzoeken op Nederlandse woorden.

## Wat nog niet vertaald wordt

- De uitwerking van de modules (balklaag, ligger, tweepaalspoer, doorsnede, demoblad) heeft
  een Nederlandse bron en een Engelse vertaaltabel (`templates/*.en.ts`). In een andere
  taal staat die uitwerking in het Engels.
- De formulebibliotheek, de voorbeelden van de Library en de modulekiezer hebben teksten
  in het Nederlands en het Engels; een andere taal krijgt het Engels.
- De gewichtenbibliotheek in `library/gewichten/` heeft namen per taal in elke regel. Een
  regel zonder de nieuwe taal toont het Engels.
