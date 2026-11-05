# Wijzigingen

Wat er per versie voor de gebruiker veranderd is. Zet een wijziging onder
"Nog niet uitgebracht"; `node scripts/versie.mjs zet JJJJ.W.N` maakt daar bij het
uitbrengen de sectie van die versie van. De release-tekst neemt die sectie over,
en de website van OpenAEC telt en toont de opsommingen daaruit.

## Nog niet uitgebracht

- Normen per land: kies in de projectgegevens een land of regio, en het rapport noemt de normen die daar gelden, met uitgever, editie en een link naar de officiële bron. Nederland blijft precies zoals het was. Elders vul je de grootheid voor wind, sneeuw en aardbeving in met de bron erbij; Eurocode-landen beginnen met de aanbevolen waarden uit EN 1990 en buiten de Eurocodes schrijf je de combinaties zelf. Een bestaand project is Nederlands, een nieuw project volgt de regio van het systeem
- Per project te kiezen: de eerste of de tweede generatie Eurocodes
- Een blad dat op een andere norm rust dan het land van het project, zegt dat op het scherm en op papier; buiten de Eurocodes staat er "niet getoetst" in plaats van een oordeel
- Het rapport heeft een eigen taal, te kiezen bij Document: koppen, vaste woorden, standaardteksten en rekenbladen staan in die taal, ook als de app een andere taal heeft. Een nieuw rapport neemt de taal van de app over; een bestaand rapport blijft Nederlands en ziet er hetzelfde uit
- De tab Code toont de rekentekst in de taal van de app, ook de uitleg in de verborgen regels. De rekenversie en de bestaande bladen veranderen daardoor niet; wat je typt, staat op die regel in het blad
- Een nieuw blad krijgt zijn naam in de taal van de app, ook via de API
- De laatste vaste Nederlandse teksten op het scherm en in meldingen staan nu in de vertaalbestanden, en getallen in de app volgen de notatie van de taal
- Nieuw blad Spanningen in een doorsnede: kies een vorm, stel de normaalkracht, de momenten en de dwarskrachten in twee richtingen in, en zie het spanningsverloop in de doorsnede
- PDF-blad: zoomen, schuiven en aantekenen met pen, markeerstift, pijl, kader, wolk en tekst. De aantekeningen gaan mee in het project en, als je dat kiest, op papier
- Zijpaneel: de inhoud van het rapport met alle nummers terwijl je werkt, en de paginanummers uit het laatste afdrukvoorbeeld
- Eurocode 3, moment I-profiel: lineair-elastische toets met de spanning in de doorsnede, en de tekening toont het profiel met zijn afrondingen
- Formulebibliotheek: parametrische tekeningen bij de doorsnede-eigenschappen, en momentenlijnen bij de standaardgevallen van liggers

## v2026.45.2 — 2026-11-04

- Tweepaalspoer: een draaibaar 3D-studiemodel met de poer, de palen, de kolom en de wapeningskorf. Het volgt elke wijziging in de invoer en gaat mee in het projectbestand en de IFC-uitvoer, met elke staaf als `IfcReinforcingBar`.
- Tweepaalspoer: dwarsstaven op de lijn van de diagonaal, ook in de tekening en het 3D-model. Zonder dwarsstaven rekent de diagonaal zonder spreiding.
- Tweepaalspoer: boven een diagonaal van 55° verlaagt een hogere poer de trekkracht niet meer, k₂ = 0,85 vraagt twee haarspelden per paal en de staalspanning wordt ook bij de karakteristieke last getoetst.
- Tweepaalspoer: invoer en model staan samen in beeld in het venster waarmee de app opent, en de tekening valt in een smal paneel niet meer buiten beeld.
- Library: de buigwapening geeft boven M_lim een waarschuwing in plaats van een keuze en toetst of de staven in één laag passen.
- Library: de beugels rekenen binnen cot θ van 1 tot en met 2,5, toetsen s_l,max en ρ_w,min en rekenen de extra trekkracht ΔF_td uit.
- Module toevoegen: elke tegel heeft een eigen beeld, en Marimo staat naast Jupyter onder Notebooks.
- Formulebibliotheek: de bron volgt de taal van de app.
- Vensters vallen niet meer achter het lint.

## v2026.45.1 — 2026-11-04

- Marimo als nieuwe bladsoort: een reactief Python-notebook in dezelfde afgeschermde omgeving als een Jupyter-blad. De code en per cel de laatste uitvoer staan in het project.
- Jupyter: automatisch uitvoeren, per blad te kiezen en standaard uit. Na een wijziging in de code rekenen alle cellen opnieuw; bij het openen draait er niets.
- Grafblad: 75 soorten nodes erbij voor rekenen met eenheden, logica, lijsten, tekst en geometrie, en grafbestanden zijn in te lezen. Er draait niets uit zo'n bestand.
- Bureauhuisstijl op al het papier: kleuren en lettertype gelden ook voor losse bladen, het logo staat in de kop van elke pagina en in de titelhoek van een tekening.
- Losse bladen afdrukken gaat via de vellen van het afdrukvoorbeeld, zodat de kop en de voet niet meer midden op de pagina staan.
- Eén knop Add sheet in het projectpaneel, met daarachter alle bladsoorten: nieuw of uit een bestand.
- Formulebibliotheek: elk van de 137 formules heeft een eigen schets.
- Library: de app haalt de voorbeelden bij het opstarten uit de repository, zodat een fout hersteld is zonder nieuwe release. De laatste complete stand blijft bewaard voor als er geen verbinding is.
- Jupyter: de uitvoer houdt het nummer van zijn cel.

## v2026.45.0 — 2026-11-03

- Eerste release onder de naam Open CalcSheet Studio, vanuit de openbare repository en op OpenAEC Blueprint.
- Nieuwe bladsoorten naast het rekenblad: spreadsheet, canvas, grafblad, tekenblad, Markdown en Jupyter-notebook.
- Nieuwe modules: Tweepaalspoer, een gewapendbetonnen poer op twee palen, en Ligger van hout of staal.
- Knop Rapport: één klik plus een bestandsnaam levert een PDF, met alle bladsoorten en met paginanummers in de inhoudsopgave.
- Rekenkern: een los stuk rekentekst met ingangen en uitgangen, en de graaf gaat mee in IFCX.
- De uitvoer volgt de taal van de app, en de Library met voorbeelden is erbij.
- Feedbackvenster in de titelbalk.
- Installers zijn ondertekend, met één versienummer overal.
- Beveiliging: `@js`-blokken zijn afgeschermd en het WebRTC-lek daarin is gedicht.
