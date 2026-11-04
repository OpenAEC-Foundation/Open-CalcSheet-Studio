# Spanningen in een doorsnede — wat het blad rekent

Dit document legt vast wat de module *Spanningen in een doorsnede* (Engels: *Section stresses*)
rekent, welke afspraken gelden en wat er niet in zit. Het rekenblad staat in
[`templates/doorsnede-spanningen.ts`](../packages/desktop/src/templates/doorsnede-spanningen.ts),
de handberekeningen in [`scripts/check-doorsnede.mjs`](../scripts/check-doorsnede.mjs).

Het blad is mechanica, geen normtoets: één blad waarin je een vorm kiest, de maten en de
snedekrachten invult en het spanningsverloop ziet. Er zit geen materiaal in.

## 1. Vormen

| Vorm | Maten | Afrondingen | Symmetrie |
|---|---|---|---|
| I of H | `h`, `b`, `t_w`, `t_f`, `r`, of een profiel uit de lijst (HEA, HEB, IPE) | ja, tussen lijf en flens | beide assen |
| Rechthoek | `b`, `h` | geen | beide assen |
| Rond, massief | `D` | | elke as |
| Buis, rond | `D`, `t` | | elke as |
| Koker, rechthoekig | `b`, `h`, `t_w`, `t_f` | nee, scherpe hoeken | beide assen |
| T, flens boven | `b`, `h`, `t_w`, `t_f` | nee | de z-as |
| U, rug links | `b`, `h`, `t_w`, `t_f` | nee, evenwijdige flenzen | de y-as |

Een profiel uit de lijst geeft alleen de maten uit `profielen.ts`; de grootheden komen ook dan
uit de maten, niet uit de tabel. `check-doorsnede.mjs` legt de uitkomst voor alle profielen
naast de tabel.

**L staat er niet in.** Een hoekstaal is in geen van beide assen symmetrisch: de hoofdassen zijn
gedraaid en `I_yz` is niet nul. De formule hieronder geldt dan niet in de assen die je wilt zien,
en zomaar verder rekenen zou een fout getal geven. Alle vormen hier hebben ten minste één
symmetrieas, dus `I_yz = 0` en y en z zijn hoofdassen.

## 2. Tekenafspraak

Assen: x langs de staaf, y naar rechts, **z omlaag**, de oorsprong in het zwaartepunt. De tekening
toont dat assenkruis.

| Grootheid | Positief |
|---|---|
| `N_x` | trek |
| `M_y` | trek aan de kant van +z, dus onder: een veldmoment zoals in de ligger |
| `M_z` | trek aan de kant van +y, dus rechts |
| `V_y`, `V_z` | in de richting van +y en +z |
| `σ` | trek |

`M_z` volgt niet de rechterhandregel: het teken is zo gekozen dat de formule twee gelijke termen
heeft en de afspraak voor beide momenten dezelfde is. `N` heet in het blad `N_x`: `N` is daar de
eenheid newton.

## 3. Rekenregels

Lineair-elastisch, de doorsnede ongescheurd, vlakke doorsneden blijven vlak.

**Grootheden.** `A`, het zwaartepunt, `I_y`, `I_z`, `W` en `S` komen uit de maten, via de functies
`doorsnede` en `doorsnede_S` van de rekenkern (`packages/core/src/doorsnede.ts`). `W` is de kleinste:
`I` gedeeld door de afstand tot de verste rand.

**Normaalspanning.**

    σ(y, z) = N_x/A + M_y·z/I_y + M_z·y/I_z

De uiterste waarden liggen op een hoekpunt van de omtrek, of op de cirkel in de richting van de
gradiënt. De neutrale lijn is de lijn σ = 0. Op het blad staan de afstand tot het zwaartepunt en de
hoek met de y-as; in de tekening de lijn zelf.

**Schuifspanning uit dwarskracht, volgens Jourawsky, per koorde.**

    τ = V·S/(I·b)

`S` is het statisch moment van het deel voorbij de koorde om de zwaartelijn, `b` de breedte van het
materiaal op de koorde. Op een sprong in de breedte telt de kleinste kant. De diagrammen langs de
assen tonen deze τ. `τ_z,max` en `τ_y,max` zijn de hoogste waarde langs de hele doorsnede, niet per se
op de zwaartelijn: bij een lage T ligt de zwaartelijn in de flens en de hoogste waarde op de overgang,
in het smalle lijf. Een koorde kan door een holte gaan; dan telt alleen het materiaal.

**Vergelijkingsspanning.**

    σ_v = √(σ² + 3·τ²)

De plekken staan in een tabel op het blad. Elke rij is de hoogste waarde van die groep; de hoogste van
de tabel is `σ_v,max`. De plaats daarvan staat op het blad en als ruit in de tekening.

| Groep | Vormen | Plekken | Stappen |
|---|---|---|---|
| Uiterste vezel, σ_max en σ_min | alle | het hoekpunt of het punt op de cirkel | |
| Flens | I, T, U, koker | beide vlakken van elke flens, van de wortel tot de teen | 25 per lijn |
| Lijf | I, T, U, koker | beide zijden van het lijf, over de hele hoogte | 25 per lijn |
| Binnen de doorsnede | rechthoek | een rooster over de doorsnede | 25 × 25 |
| Binnen de doorsnede | rond | een rooster in straal en hoek | 13 × 48 |
| Wand | buis | de buitenomtrek | 144 |
| Zwaartepunt | I, rechthoek, rond, T | het zwaartepunt | |

Het rooster is nodig omdat de hoogste σ_v niet altijd in een hoek of op de as ligt: met normaalkracht,
buiging en een grote dwarskracht ligt de top ertussen. Een rechthoek met 10 N/mm² uit N, 10 uit M_y aan
de rand en τ_max = 10 heeft zijn top op 21 % van de halve hoogte: 20,51 tegen 20,0 op de as en op de rand.
`check-doorsnede.mjs` legt `σ_v,max` naast een eigen, veel fijner rooster, ook met willekeurige maten en
lasten: hooguit een half procent eronder. Een grens 1 % onder de waarde uit dat rooster voldoet nooit.

### Welke τ op welke plek

De koorde is niet genoeg voor een dunwandige doorsnede: in een flens loopt de schuifstroom evenwijdig
aan de flens, en dat ziet een horizontale koorde niet. Daarom per plek:

| Vorm | Plek | τ |
|---|---|---|
| Rechthoek | overal | √(τ_z(z)² + τ_y(y)²): twee richtingen, loodrecht op elkaar |
| Rond | overal | V is de resultante; 4/3·V/A·(1 − w²/R²), met w de plaats langs V; de richting loopt naar de rand mee (het snijpunt van de raaklijnen), dus aan de rand raakt τ de omtrek |
| Buis | wand | V·S/(I·2t)·\|sin φ\|, met φ de hoek vanaf de richting van V |
| I, T | flens | \|V_z\|·(b/2 − \|y\|)·e_f/I_y + τ_y(y); e_f is de afstand van het hart van de flens tot de zwaartelijn |
| I, T | lijf | √(τ_z(z)² + τ_y(0)²) |
| U | flens | \|V_z\|·(y_t − y)·e_f/I_y + τ_y(y); y_t is de teen |
| U | lijf | τ_z(z) + \|V_y\|·S_r·\|z\|/(z_j·I_z·t_w); S_r is het statisch moment van de flens om de z-as op het hart van het lijf, z_j de halve afstand tussen de flenzen |
| Koker | liggende wand | \|V_z\|·\|y\|·e_f/I_y + τ_y(y) |
| Koker | staande wand | τ_z(z) + \|V_y\|·\|z\|·e_w/I_z; e_w is de afstand van het hart van de wand tot de z-as |

In een flens tellen de bijdragen van V_y en V_z in dezelfde richting; welke kant van de flens dat is,
hangt van de tekens af. Het blad telt ze bij elkaar op, ook aan de kant waar ze elkaar tegenwerken:
aan de veilige kant, en het geeft één regel voor alle tekens. Een koker en een buis zijn gesloten, maar
door de symmetrie is de schuifstroom daar nul op de symmetrieas, dus de open uitwerking vanaf die as
klopt. Een afronding telt in de koorde mee, niet in de flensregel: die begint aan het eind van de afronding.

## 4. Grenswaarde

`f_y` is optioneel. Op 0 geeft het blad de spanningen en geen oordeel; in de kop staat dan geen UC. Met
een grenswaarde is `UC = σ_v,max/f_y`, en de slotregel zegt of de spanning eraan voldoet. De onafgeronde
waarde beslist; `UC_max` rondt naar boven af, zodat 1,004 nooit als 1,00 in beeld komt.

Dit is een benuttingsgraad op de elastische spanning, geen staaltoets: stabiliteit, plastische reserve,
klassen en materiaalfactoren zitten er niet in.

## 5. Ongeldige invoer

Maten die geen doorsnede geven (0, een wanddikte groter dan de straal, flenzen die elkaar raken, een
afronding die niet past) of een negatieve grenswaarde geven een melding op het blad en
*Eindoordeel: ongeldige invoer, niet getoetst*. Er wordt dan niets gerekend: geen getallen, geen NaN, geen
oordeel, en de tekening meldt het ook.

## 6. Wat er niet in zit

Het blad zegt dit ook zelf, ook op papier.

- **Wringing.** Geen wringschuifspanning en geen welving. Een T en een U hebben hun dwarskrachtencentrum
  niet in het zwaartepunt: het blad neemt aan dat de dwarskracht daar doorheen gaat. Een U onder V_z en
  een T onder V_y draaien dus als de last dat niet doet, en die wringing staat er niet bij.
- **Lokale effecten:** plooi, gaten, krachtsinleiding, spanningsconcentraties in hoeken.
- **Afrondingen** bij de koker, T en U. Een echte U heeft ook schuine flenzen.
- **Materiaal, normtoets, stabiliteit en plastisch gedrag.**
- **De schuifverdeling over de breedte van een koorde.** Jourawsky geeft het gemiddelde; aan de rand
  van een brede, lage rechthoek is de werkelijke τ hoger.

## 7. Het beeld

De tekening (`doorsnedeTekening.ts`) toont de doorsnede op schaal met het spanningsveld, de neutrale lijn,
het assenkruis en de diagrammen van σ en τ langs de assen. De getallen komen onafgerond uit het blad; het
beeld rekent de spanningen niet. Omdat σ lineair is, loopt het veld in de richting van de gradiënt van
σ_min naar σ_max, met wit op σ = 0. Het zijn 64 stroken evenwijdig aan de neutrale lijn en geen kleurverloop
met een id: op papier staat een kopie van de tekening met het origineel verborgen, en een id wijst dan naar
dat verborgen exemplaar. De vorm van τ komt uit dezelfde functie van de rekenkern als het blad
(`doorsnedeDefinitie.ts`, `schuifLijn`), de piek uit het blad.

De diagrammen liggen op de schaal van de doorsnede en sluiten erop aan. Alleen bij een doorsnede die te
plat of te smal is om te lezen (een strip) krijgen ze een eigen schaal. De σ-diagrammen gaan over de assen:
bij schuine buiging ligt σ_max in een hoek, en die staat in de legenda en als stip in het veld.

Op papier staat dezelfde tekening boven het rekenblad; met de tabel erbij blijft dat op twee pagina's.

## 8. Status en controle

*Controleren*, net als de andere nieuwe modules. `check-doorsnede.mjs` rekent per vorm met de hand en
integreert daarnaast numeriek over de doorsnede, zonder de rekenkern: A, zwaartepunt, I, ∫σ dA = N,
∫σ·z dA = M_y, ∫σ·y dA = M_z en, op de lijnen die het beeld tekent, ∫τ dA = V. De boekwaarden van alle
profielen in `profielen.ts` komen eruit. Een controle door een tweede constructeur heeft nog niet plaatsgevonden.
