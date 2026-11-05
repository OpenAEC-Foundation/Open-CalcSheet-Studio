# Library

De map `library/gewichten/` is iets anders: de gewichtenbibliotheek. Die gaat wel mee in de
installer, want hij moet ook zonder verbinding werken; zie [onderaan](#gewichtenbibliotheek).

De voorbeelden in de Library van het projectpaneel zitten niet in de installer. De app
haalt ze bij elke start op uit de map [`library/`](../library) op `main` van deze
repository. Zo is een fout in een voorbeeld voor iedereen hersteld zonder nieuwe release.

## Een fout herstellen

1. Pas het blad aan in `library/<groep>/<naam>.nl.cpd` en in de Engelse versie
   `<naam>.en.cpd`. Tekst mag verschillen, de rekenregels niet.
2. Controleer het: `node scripts/check-library.mjs`. Die rekent ook de uitkomsten na tegen
   een handberekening, dus een gecorrigeerde uitkomst moet daar ook worden aangepast.
3. Zet het op `main`.

De gebruiker heeft het bij de volgende start van de app. GitHub bewaart de bestanden tot
5 minuten in zijn cache, dus het kan even duren voor de nieuwe tekst binnenkomt.

Een blad dat al in een project staat, verandert niet mee: dat is een eigen kopie van wat
er toen is ingevoegd.

## Opbouw

`library/index.json` noemt de groepen en de voorbeelden:

| veld | wat |
|---|---|
| `formaat` | de versie van deze index; verhoog die alleen als oude apps hem niet meer kunnen lezen |
| `groepen` | `id`, `naam` en `onder`, in `nl` en `en` |
| `voorbeelden[].id` | uniek, kebab-case; ook het id in de API |
| `voorbeelden[].library` | de groep in het paneel |
| `voorbeelden[].groep` | de groep in het formulevenster (`FORMULE_GROEPEN` in `formules.ts`) |
| `voorbeelden[].naam`, `uitleg` | in `nl` en `en`; de naam past op een smal paneel |
| `voorbeelden[].bron` | herkomst, bijvoorbeeld `NEN-EN 1993-1-1 6.2.5` |
| `voorbeelden[].soort` | `grafiek` of `tekening`, voor het icoon; anders weglaten |
| `voorbeelden[].beeld` | de schets uit `formuleBeeld.ts` die erbij hoort; een onbekende naam geeft geen schets |
| `voorbeelden[].nl`, `en` | de bladen, relatief aan `library/` |

Een nieuw voorbeeld of een nieuwe groep vraagt geen nieuwe app, zolang `formaat` gelijk
blijft. Nieuwe rekentaal wel: een oudere app kent die nog niet en toont dan een
foutmelding in het voorbeeld.

## Ophalen

`store/library.ts` haalt de index en alle bladen op en controleert ze. Wat er binnenkomt is
invoer van buiten: alleen paden binnen `library/`, geen dubbele id's en alles in de
verwachte vorm. Klopt er iets niet, of lukt één bestand niet, dan blijft de vorige complete
stand staan. Het voorbeeld loopt door dezelfde opschoning als elke uitwerking, en in een
blad komt het pas als de gebruiker het invoegt.

| situatie | wat de gebruiker ziet |
|---|---|
| verbinding | de nieuwste stand, die ook wordt bewaard in de instellingen |
| geen verbinding, eerder opgehaald | de bewaarde stand, met de datum en *Opnieuw proberen* |
| geen verbinding, nooit opgehaald | een lege Library met een melding en *Opnieuw proberen* |
| index met een nieuwer `formaat` | de bewaarde stand, met de vraag de app bij te werken |

De app stuurt bij het ophalen geen gegevens mee. GitHub ziet wel het IP-adres, zoals bij
elke download.

De dev-server leest uit de map op schijf, zodat je een wijziging ziet voor die op `main`
staat. Controleer een uitgebrachte versie daarom ook tegen de repository zelf.

## Gewichtenbibliotheek

`library/gewichten/<categorie>.json` is de bibliotheek die de app meelevert: één bestand per
categorie, elk op zichzelf een geldig `.weightlibrary`-bestand en elke regel op één regel tekst.
De bouw maakt van elk bestand een eigen stuk dat pas laadt als het venster opent
(`rapport/gewichtenLaden.ts`). Anders dan de voorbeelden hierboven gaan deze gegevens mee in de
installer, dus een correctie bereikt de gebruiker met de volgende release.

Een regel: `id`, `categorie`, `naam` (`en` en `nl`), `d` [m], `rho` [kN/m³], `p` [kN/m²], `toestand`
(`droog`, `nat`, `verzadigd`), `leverancier`, `regio`, `opmerking`, `bron` (`titel`, `url`, `datum`). Een
ingevulde `p` gaat voor `d` × `rho`. Een waarde uit kg krijgt de omrekening in de opmerking
(`268 kg/m² × 0.00981`), en `scripts/check-gewichten.mjs` rekent die na.

Geen bron is geen regel. Uit een norm alleen losse waarden die ook in een vrij leesbare bron staan, nooit
een tabel vrijwel integraal; geen bronnen met een CC-BY-SA-licentie. Lees een tabel uit een pdf op het
beeld van de pagina: de tekstlaag laat rijen van plaats wisselen.
