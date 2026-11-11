# Varianten

Een blad met andere invoer naast het blad zelf, in één keer doorgerekend: dezelfde
ligger in C24 en C30, of bij vijf overspanningen met per overspanning de kleinste
hoogte die voldoet. Varianten werken bij elk rekenblad en elke module, omdat ze alleen
gebruiken wat elk blad heeft: invoervelden (`?` en `@select`), de uitkomst en de
getallen. Een module hoeft er niets voor te doen. Het ontwerp staat in
[superpowers/specs/2026-11-11-varianten-design.md](superpowers/specs/2026-11-11-varianten-design.md).

## Het model

`Exemplaar.varianten` (`packages/desktop/src/store/varianten.ts`):

| veld | wat |
|---|---|
| `velden` | de invoervelden die variëren, in de volgorde van de tabel |
| `uitkomsten` | extra uitkomsten in de tabel, namen uit de uitwerking (`w_fin`) |
| `lijst` | de varianten: `id`, `naam` (V1, V2, …), `waarden` en `gezocht` |
| `opPapier` | de tabel in de afdruk en het rapport |
| `zoek` | de laatste optimalisatie, voor de dialoog |

Een variant bewaart alleen zijn **eigen** waarden. Zijn invoer is die van het blad, met
daaroverheen de eigen waarden van de velden in `velden` (`variantInvoer`). Een lege
eigen waarde volgt het blad: verandert het blad, dan verandert de variant mee. Zo
blijven de uitgangspunten van alle varianten gelijk. Haal je een veld uit `velden`,
dan vervallen de eigen waarden ervan (`zetVelden`).

Varianten horen bij het blad, net als de invoer (zie [projectmodel.md](projectmodel.md)).
Ze gaan dus vanzelf mee bij dupliceren, opslaan, in het herstelbestand, bij ongedaan
maken en in een versie van het project. In het bestand staan ze als
`ocss::blad::varianten`, met de eigen waarden in paren zoals `ocss::blad::invoer`. De
uitkomsten staan er niet in: de app rekent ze bij het openen opnieuw uit.

## Rekenen

`rekenVariant` (`packages/desktop/src/rekenen/varianten.ts`) rekent een variant langs
dezelfde route als het blad op papier en in de API: dezelfde includes, de
projectgegevens als scope, en eerst de bladen waarnaar verwezen wordt. Er komt geen
html uit. Wel deze uitkomsten:

- de maatgevende UC en het oordeel;
- de getallen en hun getoonde tekst met eenheid;
- welke invoervelden meedoen: niet in een tak van `#if` die niet gekozen is;
- de verzoeken en hashes van `@toets`-blokken;
- de eerste regel met een fout.

- **Verwijzingen.** `#2.R_paal` in een variant werkt. Andersom niet: een ander blad dat
  naar dit blad verwijst, rekent altijd met het blad zelf, nooit met een variant.
- **`@toets`.** Elke variant kan een eigen verzoek aan FEM Studio hebben, met een eigen
  hash. De antwoorden worden bij het blad vastgelegd, net als die van het blad zelf.
  Bij het opslaan blijven ook de antwoorden staan die de varianten gebruiken
  (`variantToetsHashes`, `gebruikteToetsingen`). Een opgeleverd blad toont zijn
  varianten dus ook zonder FEM Studio.

## Optimaliseren

Optimaliseren zoekt per variant de kleinste waarde van één veld waarmee het blad
voldoet (`kandidaten`, `zoekKleinste`). Het loopt de waarden op van klein naar groot en
stopt bij de eerste die voldoet. Bij een getal is dat van–tot–stap, bij een keuzelijst
de keuzes in de volgorde van het blad. Een waarde voldoet als:

- het blad zelf *voldoet* zegt;
- het blad niet *niet getoetst* is;
- de maatgevende UC hoogstens de grens is. Geeft het blad geen UC, dan alleen bij een
  grens van 1 of hoger (`voldoetAan`).

Elke gekozen waarde is dus echt doorgerekend. Voldoet er geen, dan verandert er niets.

## Controleren

```
node scripts/check-varianten.mjs
```

Het model, opslaan en openen, doorrekenen met een handberekening, optimaliseren en het
bewaren van de antwoorden van FEM Studio.
