import type { BladVertaling } from "../components/calc/uitvoerTaal";

/** Het demoblad in het Engels; zie balklaag.en.ts. */
export const rekentaalDemoEn: BladVertaling = {
  marker: "\"Open CalcSheet Studio demo",
  tekst: {
    "Balk in 3D": "Beam in 3D",
    "Voorbeeldpagina": "Example page",
    "Dit blad is zelf het voorbeeld: in de editor staat de rekentaal, in de uitwerking wat daaruit volgt. Elk hoofdstuk behandelt één onderdeel, met eerst een korte uitleg en de schrijfwijze (in <code>deze letter</code>) en daarna het werkende voorbeeld. De rode draad is een stalen ligger op twee steunpunten. Verander gerust iets in de editor of in de invoervelden en kijk wat er meebeweegt":
      "This sheet is itself the example: the editor holds the calculation language, the worked-out sheet shows what follows from it. Each chapter covers one topic, first with a short explanation and the notation (in <code>deze letter</code>), then the working example. The common thread is a steel beam on two supports. Feel free to change something in the editor or in the input fields and see what changes with it",
    "Dit blad laat zien wat de rekentaal kan, met een stalen ligger als rode draad. De uitleg en de hoofdstukken over alleen de schrijfwijze staan alleen op het scherm":
      "This sheet shows what the calculation language can do, with a steel beam as the common thread. The explanations and the chapters on notation alone appear on screen only",

    "1. Tekst en koppen": "1. Text and headings",
    "Een regel die met <code>\"</code> begint, is de titel van het blad (zie bovenaan). Met <code># 1. Kop</code> begin je een hoofdstuk en met <code>## 1.1 Kop</code> een paragraaf, tot zes niveaus diep. Een regel die met een apostrof <code>&#39;</code> begint, is tekst. Daarin mag HTML: <code>&lt;b&gt;</code> voor vet, <code>&lt;sub&gt;</code> voor een subscript en <code>&lt;sup&gt;</code> voor een superscript. Een regel die met <code>//</code> begint, is commentaar voor jezelf en verschijnt nergens":
      "A line starting with <code>\"</code> is the title of the sheet (see the top). With <code># 1. Kop</code> you start a chapter and with <code>## 1.1 Kop</code> a section, up to six levels deep. A line starting with an apostrophe <code>&#39;</code> is text. HTML is allowed there: <code>&lt;b&gt;</code> for bold, <code>&lt;sub&gt;</code> for a subscript and <code>&lt;sup&gt;</code> for a superscript. A line starting with <code>//</code> is a comment for yourself and appears nowhere",
    "Tekst met": "Text with",
    "vet": "bold",
    "onderstreept": "underlined",
    "f<sub>y,d</sub>, mm<sup>2</sup> en tekens als γ, σ, ≤, ⌀ en ±": "f<sub>y,d</sub>, mm<sup>2</sup> and characters such as γ, σ, ≤, ⌀ and ±",
    "1.1 Scherm en papier": "1.1 Screen and paper",
    "Een tekstregel die helemaal cursief staat, zoals deze, geldt als uitleg: op het scherm zichtbaar, op papier weggelaten. Bijna alle uitleg op dit blad staat cursief, zodat het afdrukvoorbeeld beknopt blijft. Moet een cursieve regel toch op papier, schrijf dan <code>&lt;i class=\"ook-afdruk\"&gt;</code>. Een leeg merkteken <code>&lt;span class=\"alleen-scherm\"&gt;&lt;/span&gt;</code> ergens in een regel houdt de hele regel van het papier, ook een formule (in de toelichting erachter) of een invoerveld. Zo staan hoofdstuk 1 en 2 helemaal alleen op het scherm; hun kop is daarom een tekstregel met het merkteken erin: <code>&#39;&lt;h1&gt;2. …&lt;span class=\"alleen-scherm\"&gt;&lt;/span&gt;&lt;/h1&gt;</code>. Het afdrukvoorbeeld laat zien wat er dan op papier overblijft":
      "A text line that is entirely in italics, like this one, counts as explanation: visible on screen, left out on paper. Almost all explanation on this sheet is in italics, so that the print preview stays concise. If an italic line has to go on paper after all, write <code>&lt;i class=\"ook-afdruk\"&gt;</code>. An empty marker <code>&lt;span class=\"alleen-scherm\"&gt;&lt;/span&gt;</code> anywhere in a line keeps the whole line off the paper, also a formula (in the note behind it) or an input field. That is how chapters 1 and 2 appear on screen only; their heading is therefore a text line with the marker in it: <code>&#39;&lt;h1&gt;2. …&lt;span class=\"alleen-scherm\"&gt;&lt;/span&gt;&lt;/h1&gt;</code>. The print preview shows what then remains on paper",

    "2. Variabelen, formules en eenheden": "2. Variables, formulas and units",
    "Een toekenning schrijf je als <code>naam = waarde</code>, met de eenheid direct achter het getal. Een naam begint met een letter en mag cijfers, Griekse letters en liggende streepjes bevatten. Alles na het eerste streepje wordt subscript, een komma daarin ook: <code>f_y,d</code> staat er als f<sub>y,d</sub>. Tekst tussen apostrofs achter een formule komt er als toelichting naast: <code>t_pl = 12 mm&#39;, dikte&#39;</code>":
      "You write an assignment as <code>naam = waarde</code>, with the unit directly after the number. A name starts with a letter and may contain digits, Greek letters and underscores. Everything after the first underscore becomes subscript, and so does a comma in it: <code>f_y,d</code> appears as f<sub>y,d</sub>. Text between apostrophes after a formula appears next to it as a note: <code>t_pl = 12 mm&#39;, dikte&#39;</code>",
    "dikte van een strip": "thickness of a strip",
    "breedte": "width",
    "Een formule toont drie stappen: de formule, de ingevulde waarden en de uitkomst. Eenheden rekenen vanzelf mee: millimeters maal centimeters geeft een oppervlak":
      "A formula shows three steps: the formula, the values filled in and the result. Units are included in the calculation automatically: millimetres times centimetres gives an area",
    "Met <code>to</code> reken je om naar de eenheid die je wilt zien; <code>&#124;cm^2</code> achter de formule doet hetzelfde. Een moment schrijf je als <code>kN*m</code>, een spanning als <code>N/mm^2</code>":
      "With <code>to</code> you convert to the unit you want to see; <code>&#124;cm^2</code> after the formula does the same. You write a moment as <code>kN*m</code>, a stress as <code>N/mm^2</code>",
    "elasticiteitsmodulus van staal": "modulus of elasticity of steel",
    "dichtheid van staal": "density of steel",
    "valversnelling": "gravitational acceleration",
    "volumiek gewicht": "unit weight",
    "Eenheden die niet bij elkaar passen, zoals meters plus kilonewtons, geven een foutmelding in plaats van een verkeerd getal. Een kaal getal krijg je door te delen door de eenheid; dat heb je nodig voor tekeningen, die in pixels rekenen":
      "Units that do not match, such as metres plus kilonewtons, give an error message instead of a wrong number. You get a bare number by dividing by the unit; you need that for drawings, which calculate in pixels",
    "Alleen een naam op een regel toont de waarde nog eens. Wat je niet wilt laten zien, zet je tussen <code>#hide</code> en <code>#show</code>: het wordt wel berekend en is verderop te gebruiken. In een tekstregel zet je een waarde tussen apostrofs: <code>&#39;I = &#39;I_pl&#39; mm&lt;sup&gt;4&lt;/sup&gt;</code>":
      "A name alone on a line shows the value again. What you do not want to show goes between <code>#hide</code> and <code>#show</code>: it is still calculated and can be used further on. In a text line you put a value between apostrophes: <code>&#39;I = &#39;I_pl&#39; mm&lt;sup&gt;4&lt;/sup&gt;</code>",
    "Verborgen berekend: de strip heeft om zijn zwakke as I": "Calculated out of sight: about its weak axis the strip has I",

    "3. Invoer: invoervelden en keuzelijsten": "3. Input: input fields and drop-down lists",
    "Met <code>F_k = ?{10}*(kN)</code> maak je een invoerveld met een eenheid en een standaardwaarde; zonder eenheid schrijf je <code>n = ?{3}</code>. Zolang je niets invult, rekent het blad met de standaardwaarde, en die staat ook in het veld; typ je een eigen waarde, dan telt die. Zonder <code>{…}</code> begint een veld op 0. Het invoerveld zelf staat alleen op het scherm; daaronder staat de waarde waarmee gerekend wordt, en die komt ook op papier":
      "With <code>F_k = ?{10}*(kN)</code> you make an input field with a unit and a default value; without a unit you write <code>n = ?{3}</code>. As long as you enter nothing, the sheet uses the default value, which is also shown in the field; if you type your own value, that one counts. Without <code>{…}</code> a field starts at 0. The input field itself appears on screen only; below it is the value used in the calculation, which also appears on paper",
    "overspanning": "span",
    "puntlast in het midden": "point load at mid-span",
    "puntlast in het midden, veranderlijk": "point load at mid-span, variable",
    "Vaste invoer staat gewoon als toekenning in het blad; die pas je aan in de editor": "Fixed input is simply an assignment in the sheet; you change it in the editor",
    "permanente last, zonder het eigen gewicht": "permanent load, without the self-weight",
    "veranderlijke last, vloer in een woning": "variable load, floor in a dwelling",
    "Een keuzelijst is een blok van <code>@select naam \"Omschrijving\"</code> tot <code>@end</code>, met per regel <code>tekst = getal</code>. Het getal van de gekozen regel komt in de variabele":
      "A drop-down list is a block from <code>@select naam \"Omschrijving\"</code> to <code>@end</code>, with <code>tekst = getal</code> on each line. The number of the chosen line goes into the variable",
    "Profiel": "Section",
    "Staalsoort": "Steel grade",
    "Puntlast": "Point load",
    "meenemen": "include",
    "weglaten": "omit",
    "vloeigrens, EN 1993-1-1 tabel 3.1 (t ≤ 40 mm)": "yield strength, EN 1993-1-1 table 3.1 (t ≤ 40 mm)",

    "4. Tabellen en rekenfuncties": "4. Tables and calculation functions",
    "Een tabel is een matrix tussen vierkante haken: <code>;</code> scheidt de elementen in een rij, <code>&#124;</code> begint een nieuwe rij. De profieltabel heeft zeven rijen: het nummer, h, b, t<sub>w</sub>, t<sub>f</sub> en r in mm, en de massa in kg/m; elk profiel is een kolom. In de editor staat hij verborgen; de tabel hieronder is met een herhaling opgebouwd (zie hoofdstuk 7)":
      "A table is a matrix between square brackets: <code>;</code> separates the elements in a row, <code>&#124;</code> starts a new row. The section table has seven rows: the number, h, b, t<sub>w</sub>, t<sub>f</sub> and r in mm, and the mass in kg/m; each section is a column. In the editor it is hidden; the table below is built up with a loop (see chapter 7)",
    "<code>hlookup(M; waarde; i; j)</code> zoekt in rij i van M de kolom met die waarde en geeft het element uit rij j van die kolom. Met het nummer uit de keuzelijst haal je zo de maten van het gekozen profiel op; de eenheid zet je er met een vermenigvuldiging bij":
      "<code>hlookup(M; waarde; i; j)</code> looks in row i of M for the column with that value and returns the element from row j of that column. With the number from the drop-down list you fetch the dimensions of the chosen section this way; you add the unit with a multiplication",
    "eigen gewicht": "self-weight",
    "4.1 Doorsnedegrootheden uit de rekenkern": "4.1 Section properties from the calculation core",
    "De rekenkern heeft constructieve functies die een matrix als invoer nemen. <code>doorsnede(D)</code> berekent de grootheden van een doorsnede uit rechthoeken, cirkels of buizen en I-profielen. Elk deel is een kolom in D met tien rijen: de soort (3 = I-profiel), h, b, t<sub>w</sub>, t<sub>f</sub>, r, de plaats y en z van het hart, de factor n en de stand (0 = staand). De uitkomst is een vector in mm: [A; y<sub>c</sub>; z<sub>c</sub>; I<sub>y</sub>; I<sub>z</sub>; …]. Element k van een vector v haal je op met <code>v.k</code>. <code>doorsnede_pl(D; 1)</code> geeft het plastisch weerstandsmoment om de y-as":
      "The calculation core has structural functions that take a matrix as input. <code>doorsnede(D)</code> calculates the properties of a cross-section made up of rectangles, circles or tubes and I-sections. Each part is a column in D with ten rows: the type (3 = I-section), h, b, t<sub>w</sub>, t<sub>f</sub>, r, the position y and z of the centre, the factor n and the orientation (0 = upright). The result is a vector in mm: [A; y<sub>c</sub>; z<sub>c</sub>; I<sub>y</sub>; I<sub>z</sub>; …]. You fetch element k of a vector v with <code>v.k</code>. <code>doorsnede_pl(D; 1)</code> gives the plastic section modulus about the y-axis",
    "oppervlak": "area",
    "traagheidsmoment om de sterke as": "second moment of area about the strong axis",
    "elastisch weerstandsmoment": "elastic section modulus",
    "plastisch weerstandsmoment": "plastic section modulus",
    "Ter controle: voor een IPE 200 geeft de profieltabel A = 28,5 cm², I<sub>y</sub> = 1943 cm⁴ en W<sub>pl,y</sub> = 220,6 cm³; de afrondingen tussen lijf en flens tellen mee":
      "As a check: for an IPE 200 the section table gives A = 28.5 cm², I<sub>y</sub> = 1943 cm⁴ and W<sub>pl,y</sub> = 220.6 cm³; the fillets between web and flange are included",

    "5. Functies": "5. Functions",
    "De gangbare wiskundige functies zijn er: <code>sqrt</code>, <code>abs</code>, <code>min</code>, <code>max</code>, <code>round</code>, <code>ceil</code>, <code>floor</code>, <code>sin</code>, <code>cos</code>, <code>tan</code>, <code>ln</code>, <code>log10</code> en <code>exp</code>, met de constanten <code>π</code> en <code>e</code>. Argumenten scheid je met een puntkomma. Geef een hoek met zijn eenheid (<code>35 deg</code>), dan klopt hij ongeacht de hoekinstelling van het programma":
      "The usual mathematical functions are available: <code>sqrt</code>, <code>abs</code>, <code>min</code>, <code>max</code>, <code>round</code>, <code>ceil</code>, <code>floor</code>, <code>sin</code>, <code>cos</code>, <code>tan</code>, <code>ln</code>, <code>log10</code> and <code>exp</code>, with the constants <code>π</code> and <code>e</code>. You separate arguments with a semicolon. Give an angle with its unit (<code>35 deg</code>), then it is correct regardless of the angle setting of the program",
    "kracht in een schoor": "force in a strut",
    "hoek met de horizontaal": "angle with the horizontal",
    "staafdiameter": "bar diameter",
    "aantal staven voor 400 mm²": "number of bars for 400 mm²",
    "5.1 Eigen functies": "5.1 User-defined functions",
    "Een eigen functie schrijf je als <code>naam(a; b) = formule</code>. Daarna gebruik je hem als elke andere functie, met of zonder eenheden. Hieronder het weerstandsmoment van een rechthoek, toegepast op een houten balk; de maten komen uit twee invoervelden":
      "You write a user-defined function as <code>naam(a; b) = formule</code>. After that you use it like any other function, with or without units. Below the section modulus of a rectangle, applied to a timber beam; the dimensions come from two input fields",
    "breedte van de balk": "width of the beam",
    "hoogte van de balk": "depth of the beam",
    "Toets op buiging volgens EN 1995-1-1, voor C24 in klimaatklasse 1 met een belasting van middellange duur en een gegeven rekenmoment": "Bending check according to EN 1995-1-1, for C24 in service class 1 with a medium-term load and a given design moment",
    "rekenmoment (gegeven)": "design moment (given)",
    "tabel 3.1: klimaatklasse 1, middellang": "table 3.1: service class 1, medium-term",
    "tabel 2.3: massief hout": "table 2.3: solid timber",
    "3.2(3), formule (3.1); 1 bij h ≥ 150 mm": "3.2(3), formula (3.1); 1 for h ≥ 150 mm",
    "formule (2.14)": "formula (2.14)",
    "formule (6.11), buiging om één as": "formula (6.11), bending about one axis",
    "5.2 Functies met tekst": "5.2 Functions with text",
    "Een functie mag ook tekst teruggeven, met <code>if(voorwaarde; dan; anders)</code> om te kiezen. Tekst laat zich niet als formule tonen; de twee functies hieronder staan daarom verborgen. Ze kleuren het oordeel, hier en in hoofdstuk 6":
      "A function may also return text, with <code>if(voorwaarde; dan; anders)</code> to choose. Text cannot be shown as a formula; the two functions below are therefore hidden. They colour the verdict, here and in chapter 6",
    "voldoet": "OK",
    "voldoet niet": "not OK",
    "Houten balk": "Timber beam",

    "6. Normtoetsing met voorwaarden": "6. Code checks with conditions",
    "Nu de stalen ligger: de belastingcombinaties volgens EN 1990 en de toetsen volgens EN 1993-1-1, met het artikel achter elke formule. Gevolgklasse CC2, met de factoren uit de Nederlandse nationale bijlage. De veranderlijke lasten q<sub>k</sub> en F<sub>k</sub> komen uit hetzelfde gebruik en tellen samen als één veranderlijke belasting; alle maxima liggen in het midden of bij de opleggingen":
      "Now the steel beam: the load combinations according to EN 1990 and the checks according to EN 1993-1-1, with the clause after each formula. Consequence class CC2, with the factors from the Dutch national annex. The variable loads q<sub>k</sub> and F<sub>k</sub> come from the same use and count together as one variable load; all maxima lie at mid-span or at the supports",
    "6.1 Belastingcombinaties (EN 1990)": "6.1 Load combinations (EN 1990)",
    "categorie A, vloeren in woningen (NB tabel A1.1)": "category A, floors in dwellings (NA table A1.1)",
    "de puntlast, als die is meegenomen": "the point load, if included",
    "formule (6.10a)": "formula (6.10a)",
    "formule (6.10b)": "formula (6.10b)",
    "Met <code>#if voorwaarde</code> … <code>#else if</code> … <code>#else</code> … <code>#end if</code> toon en reken je alleen het deel dat van toepassing is. Vergelijken gaat met <code>&lt; &gt; ≤ ≥ ≡ ≠</code>, waarin <code>≡</code> betekent: is gelijk aan. Grootheden met een eenheid vergelijk je gewoon: <code>#if L &gt; 6 m</code>":
      "With <code>#if voorwaarde</code> … <code>#else if</code> … <code>#else</code> … <code>#end if</code> you show and calculate only the part that applies. You compare with <code>&lt; &gt; ≤ ≥ ≡ ≠</code>, in which <code>≡</code> means: is equal to. Quantities with a unit are simply compared: <code>#if L &gt; 6 m</code>",
    "Combinatie (6.10a) is maatgevend: de permanente last overheerst": "Combination (6.10a) is governing: the permanent load dominates",
    "Combinatie (6.10b) is maatgevend": "Combination (6.10b) is governing",
    "rekenwaarde van de verdeelde last": "design value of the distributed load",
    "rekenwaarde van de puntlast": "design value of the point load",
    "6.2 Doorsnedeklasse (EN 1993-1-1 tabel 5.2)": "6.2 Cross-section class (EN 1993-1-1 table 5.2)",
    "uitstekend deel van de flens": "outstand part of the flange",
    "recht deel van het lijf": "straight part of the web",
    "Flens (c/t ≤ 9ε) en lijf (c/t ≤ 72ε) vallen in klasse 1: de doorsnede mag plastisch rekenen": "Flange (c/t ≤ 9ε) and web (c/t ≤ 72ε) fall in class 1: the section may be calculated plastically",
    "Flens (c/t ≤ 10ε) en lijf (c/t ≤ 83ε) vallen in klasse 2: de doorsnede mag plastisch rekenen": "Flange (c/t ≤ 10ε) and web (c/t ≤ 83ε) fall in class 2: the section may be calculated plastically",
    "Klasse 3 of hoger: het blad rekent elastisch (klasse 4 valt buiten dit voorbeeld)": "Class 3 or higher: the sheet calculates elastically (class 4 falls outside this example)",
    "6.3 Toetsen (EN 1993-1-1)": "6.3 Checks (EN 1993-1-1)",
    "NB": "NA",
    "formule (6.13) of (6.14)": "formula (6.13) or (6.14)",
    "formule (6.12)": "formula (6.12)",
    "flenzen buiten lijf en afrondingen": "flanges outside web and fillets",
    "ondergrens η·h<sub>w</sub>·t<sub>w</sub> met η = 1,0": "lower limit η·h<sub>w</sub>·t<sub>w</sub> with η = 1.0",
    "formule (6.18)": "formula (6.18)",
    "formule (6.17)": "formula (6.17)",
    "karakteristiek, verdeelde last": "characteristic, distributed load",
    "karakteristiek, puntlast": "characteristic, point load",
    "in het midden": "at mid-span",
    "gekozen grens": "chosen limit",
    "Ruim voldoende": "More than sufficient",
    "Het profiel is minder dan half benut; een lichter profiel kan waarschijnlijk ook": "The section is less than half utilised; a lighter section will probably do as well",
    "Voldoende": "Sufficient",
    "De maatgevende toets is benut tot": "The governing check is utilised up to",
    "Onvoldoende": "Insufficient",
    "Kies een zwaarder profiel of S355; hoofdstuk 7 laat zien welke profielen voldoen": "Choose a heavier section or S355; chapter 7 shows which sections pass",
    "Buiging": "Bending",
    "dwarskracht": "shear force",
    "doorbuiging": "deflection",
    "Maatgevende UC": "Governing UC",

    "7. Herhalingen": "7. Loops",
    "<code>#for i = 1 : n</code> … <code>#loop</code> herhaalt de regels ertussen voor i = 1, 2, … n. Binnen een herhaling mag alles staan: formules, tekst, voorwaarden en tekenopdrachten. Een tabel bouw je zo regel voor regel op met HTML: <code>&lt;table&gt;</code> op een tekstregel voor de herhaling, een <code>&lt;tr&gt;</code> per keer erin en <code>&lt;/table&gt;</code> erna":
      "<code>#for i = 1 : n</code> … <code>#loop</code> repeats the lines between them for i = 1, 2, … n. Anything may go inside a loop: formulas, text, conditions and drawing instructions. This way you build a table line by line with HTML: <code>&lt;table&gt;</code> on a text line before the loop, a <code>&lt;tr&gt;</code> per pass inside it and <code>&lt;/table&gt;</code> after it",
    "7.1 Het verloop langs de ligger (#for)": "7.1 The variation along the beam (#for)",
    "In het midden staat de dwarskracht direct links van de puntlast": "At mid-span the table gives the shear force just left of the point load",
    "7.2 Een vast aantal keer (#repeat)": "7.2 A fixed number of times (#repeat)",
    "<code>#repeat n</code> … <code>#loop</code> herhaalt n keer; de teller staat in <code>_i</code>. Zolang een voorwaarde geldt, herhaal je met <code>#while voorwaarde</code> … <code>#loop</code>. Hier de buigtoets voor alle zes profielen uit de tabel, met dezelfde belasting en staalsoort en per profiel het eigen gewicht. Alle zes zijn bij buiging klasse 1":
      "<code>#repeat n</code> … <code>#loop</code> repeats n times; the counter is in <code>_i</code>. As long as a condition holds, you repeat with <code>#while voorwaarde</code> … <code>#loop</code>. Here the bending check for all six sections from the table, with the same load and steel grade and the self-weight per section. All six are class 1 in bending",
    "7.3 Voortijdig stoppen (#break)": "7.3 Stopping early (#break)",
    "Met <code>#break</code> stop je een herhaling zodra een voorwaarde is bereikt. De herhaling hieronder verhoogt de puntlast in stappen van 5 kN en stopt bij de eerste stap waarbij de buiging van het gekozen profiel niet meer voldoet":
      "With <code>#break</code> you stop a loop as soon as a condition is reached. The loop below raises the point load in steps of 5 kN and stops at the first step at which the bending of the chosen section is no longer OK",
    "Ook bij een puntlast van 100 kN voldoet de buiging nog": "Even with a point load of 100 kN the bending is still OK",
    "De buiging voldoet tot en met F<sub>k</sub>": "The bending is OK up to and including F<sub>k</sub>",
    "kN; bij": "kN; at",
    "kN niet meer": "kN it no longer is",
    "Zelfs zonder puntlast voldoet de buiging niet": "Even without a point load the bending is not OK",

    "8. Matrices: een stelsel oplossen": "8. Matrices: solving a system",
    "Met matrices reken je als op papier: <code>A*B</code> vermenigvuldigt, <code>inverse(A)</code> keert om, <code>det(A)</code> is de determinant, <code>transp(A)</code> de getransponeerde en <code>lsolve(A; b)</code> lost het stelsel A·x = b op. Een matrix schrijf je rij voor rij: <code>;</code> tussen de elementen van een rij en <code>&#124;</code> tussen de rijen, dus <code>[a; b &#124; c; d]</code> heeft de rijen [a; b] en [c; d]. Een vector schrijf je als <code>[a; b; c]</code>. Een element lees je met <code>v.i</code> of <code>M.(i; j)</code>, en je kunt het ook een nieuwe waarde geven: <code>M.(i; j) = …</code>. <code>matrix(m; n)</code> maakt een matrix van m × n nullen. Matrices mogen eenheden dragen":
      "You calculate with matrices as on paper: <code>A*B</code> multiplies, <code>inverse(A)</code> inverts, <code>det(A)</code> is the determinant, <code>transp(A)</code> the transpose and <code>lsolve(A; b)</code> solves the system A·x = b. You write a matrix row by row: <code>;</code> between the elements of a row and <code>&#124;</code> between the rows, so <code>[a; b &#124; c; d]</code> has the rows [a; b] and [c; d]. You write a vector as <code>[a; b; c]</code>. You read an element with <code>v.i</code> or <code>M.(i; j)</code>, and you can also give it a new value: <code>M.(i; j) = …</code>. <code>matrix(m; n)</code> makes a matrix of m × n zeros. Matrices may carry units",
    "8.1 Een stijfheidsmatrix opbouwen in een herhaling": "8.1 Building a stiffness matrix in a loop",
    "Een gebouw van drie verdiepingen met stabiliteitswanden, voorgesteld als veren boven elkaar: verdieping i heeft stijfheid k<sub>i</sub> en op vloer i werkt windkracht F<sub>i</sub>. Veer i verbindt vloer i − 1 met vloer i. De herhaling telt de stijfheid van elke veer op de juiste plaatsen in K op (assembleren); de lus staat verborgen, daarna volgen K, F en de verplaatsingen u uit K·u = F":
      "A three-storey building with shear walls, represented as springs above each other: storey i has stiffness k<sub>i</sub> and wind force F<sub>i</sub> acts on floor i. Spring i connects floor i − 1 to floor i. The loop adds the stiffness of each spring at the right places in K (assembly); the loop is hidden, after which K, F and the displacements u follow from K·u = F",
    "aantal verdiepingen": "number of storeys",
    "verdiepingsstijfheden, van onder naar boven": "storey stiffnesses, from bottom to top",
    "windkracht per vloer, van onder naar boven": "wind force per floor, from bottom to top",
    "eerste vloer": "first floor",
    "tweede vloer": "second floor",
    "dak": "roof",
    "Controle langs twee andere wegen: met de inverse, <code>inverse(K)*F</code>, en met de hand. Elke verdieping draagt de windkracht op alle vloeren erboven": "Check in two other ways: with the inverse, <code>inverse(K)*F</code>, and by hand. Each storey carries the wind force on all floors above it",
    "Controle: lsolve, inverse(K)·F en de handberekening geven dezelfde verplaatsing van het dak": "Check: lsolve, inverse(K)·F and the hand calculation give the same displacement of the roof",
    "Controle: lsolve, inverse(K)·F en de handberekening verschillen": "Check: lsolve, inverse(K)·F and the hand calculation differ",
    "8.2 Een niet-symmetrisch stelsel: evenwicht": "8.2 A non-symmetric system: equilibrium",
    "Een matrix hoeft niet symmetrisch te zijn. De oplegreacties van een ligger op twee steunpunten met een puntlast F op afstand a van A volgen uit twee evenwichtsvergelijkingen: verticaal R<sub>A</sub> + R<sub>B</sub> = F, en momenten om A: 0·R<sub>A</sub> + L·R<sub>B</sub> = F·a. Elke vergelijking is een rij van A·R = b, met eenheden per rij":
      "A matrix need not be symmetric. The support reactions of a beam on two supports with a point load F at distance a from A follow from two equilibrium equations: vertical R<sub>A</sub> + R<sub>B</sub> = F, and moments about A: 0·R<sub>A</sub> + L·R<sub>B</sub> = F·a. Each equation is a row of A·R = b, with units per row",
    "controle met de hand": "check by hand",

    "9. Doorgaande ligger op drie steunpunten": "9. Continuous beam on three supports",
    "Voor een statisch onbepaalde ligger heeft de rekenkern <code>ligger(geo; last; EI)</code>. De geometrie heeft twee rijen: de plaatsen x van de punten en hun soort (1 = steunpunt, 2 = inklemming, 3 = scharnier, 0 = vrij einde). De belasting heeft vijf rijen, met per last een kolom: de soort (1 = verdeelde last van a tot b, 2 = puntlast in a), a, b, q<sub>a</sub> en q<sub>b</sub>. De uitkomst is een tabel met per punt langs de ligger x, V, M en w, in m, kN en kNm; <code>ligger_R</code> geeft per steunpunt x, de reactie R en het moment. Element (i; j) van een matrix M haal je op met <code>M.(i; j)</code>":
      "For a statically indeterminate beam the calculation core has <code>ligger(geo; last; EI)</code>. The geometry has two rows: the positions x of the points and their type (1 = support, 2 = fixed end, 3 = hinge, 0 = free end). The load has five rows, with a column per load: the type (1 = distributed load from a to b, 2 = point load at a), a, b, q<sub>a</sub> and q<sub>b</sub>. The result is a table with x, V, M and w per point along the beam, in m, kN and kNm; <code>ligger_R</code> gives x, the reaction R and the moment per support. You fetch element (i; j) of a matrix M with <code>M.(i; j)</code>",
    "Hier een ligger over drie steunpunten waarvan alleen het linkerveld belast is, met de buigstijfheid van het gekozen profiel": "Here a beam over three supports of which only the left span is loaded, with the bending stiffness of the chosen section",
    "linkerveld": "left span",
    "rechterveld": "right span",
    "last op het linkerveld": "load on the left span",
    "gelijkmatige last op het linkerveld": "uniform load on the left span",
    "Verborgen berekend: R<sub>l</sub> = ligger(geo; last; EI) en R<sub>s</sub> = ligger_R(geo; last; EI). De reacties zijn de tweede kolom van R<sub>s</sub>, de uitersten komen uit <code>ligger_ext</code>":
      "Calculated out of sight: R<sub>l</sub> = ligger(geo; load; EI) and R<sub>s</sub> = ligger_R(geo; load; EI). The reactions are the second column of R<sub>s</sub>, the extremes come from <code>ligger_ext</code>",
    "steunmoment boven B": "support moment over B",
    "grootste veldmoment": "largest span moment",
    "plaats van het grootste veldmoment": "position of the largest span moment",
    "grootste doorbuiging onder deze last": "largest deflection under this load",
    "Controle met de vergelijking van drie momenten: bij een gelijkmatige last op het linkerveld is 2·M<sub>B</sub>·(L<sub>1</sub> + L<sub>2</sub>) = −q·L<sub>1</sub>³/4. Daaruit volgen de reacties met het evenwicht van de twee velden. R<sub>C</sub> is negatief: de oplegging rechts moet de ligger omlaag houden":
      "Check with the three-moment equation: for a uniform load on the left span 2·M<sub>B</sub>·(L<sub>1</sub> + L<sub>2</sub>) = −q·L<sub>1</sub>³/4. The reactions follow from that with the equilibrium of the two spans. R<sub>C</sub> is negative: the support on the right has to hold the beam down",
    "totale last op het linkerveld": "total load on the left span",
    "som van de reacties, gelijk aan Q<sub>1</sub>": "sum of the reactions, equal to Q<sub>1</sub>",
    "Het schema op schaal, met de reacties en de momentenlijn aan de trekzijde (met <code>ligger_svg</code>). De steunpunten en de reactiepijlen zijn macro’s: <code>#def naam&#36;(a&#36;; b&#36;)</code> … <code>#end def</code>, één keer beschreven en drie keer aangeroepen":
      "The system to scale, with the reactions and the moment diagram on the tension side (with <code>ligger_svg</code>). The supports and the reaction arrows are macros: <code>#def naam&#36;(a&#36;; b&#36;)</code> … <code>#end def</code>, described once and called three times",
    "Het verloop van het moment en de dwarskracht als grafiek met eenheden. <code>ligger_int(R; k; x)</code> geeft kolom k van de uitkomst in het punt x (k = 2 dwarskracht, k = 3 moment) als kaal getal in kN of kNm; vermenigvuldigd met de eenheid wordt het weer een grootheid. Met grenzen met een eenheid (<code>x = 0 m : L_1 + L_2</code>) rekent x in meters, en de eenheden komen bij de assen. <code>PlotHeight = 220</code> maakt de grafieken lager (standaard 320 pixels; de breedte zet je met <code>PlotWidth</code>)":
      "The variation of the moment and the shear force as a graph with units. <code>ligger_int(R; k; x)</code> gives column k of the result at point x (k = 2 shear force, k = 3 moment) as a bare number in kN or kNm; multiplied by the unit it is a quantity again. With limits that have a unit (<code>x = 0 m : L_1 + L_2</code>) x calculates in metres, and the units appear on the axes. <code>PlotHeight = 220</code> makes the graphs lower (default 320 pixels; you set the width with <code>PlotWidth</code>)",
    "het moment langs de ligger; positief geeft trek aan de onderzijde": "the moment along the beam; positive gives tension at the bottom",
    "de dwarskracht langs de ligger": "the shear force along the beam",

    "10. Grafieken en oplossers": "10. Graphs and solvers",
    "<code>&#36;Plot{f(x) @ x = a : b}</code> tekent f(x) voor x van a tot b. Meer lijnen in één grafiek scheid je met <code>&amp;</code>, en een getal als lijn geeft een horizontale lijn. Krijgen de grenzen een eenheid (<code>x = 1 m : 12 m</code>), dan rekent x met die eenheid; zonder eenheid rekent de grafiek met kale getallen":
      "<code>&#36;Plot{f(x) @ x = a : b}</code> draws f(x) for x from a to b. You separate more lines in one graph with <code>&amp;</code>, and a number as a line gives a horizontal line. If the limits have a unit (<code>x = 1 m : 12 m</code>), x calculates with that unit; without a unit the graph calculates with bare numbers",
    "10.1 De unity check als functie van de overspanning": "10.1 The unity check as a function of the span",
    "Een eigen functie in een grafiek: de unity check voor buiging als functie van de overspanning x, voor beide combinaties, met de grens 1 erbij": "A user-defined function in a graph: the unity check for bending as a function of the span x, for both combinations, with the limit 1 added",
    "━━ UC voor buiging": "━━ UC for bending",
    "━━ grens 1": "━━ limit 1",
    "10.2 Oplossers: nulpunt en maximum": "10.2 Solvers: root and maximum",
    "Een oplosser zoekt een waarde voor je: <code>&#36;Root{f(x) = c @ x = a : b}</code> zoekt tussen a en b waar f(x) gelijk is aan c (zonder <code>= c</code>: waar f(x) nul is), <code>&#36;Sup{…}</code> en <code>&#36;Inf{…}</code> zoeken de grootste en de kleinste waarde. Ook dat kan met eenheden":
      "A solver finds a value for you: <code>&#36;Root{f(x) = c @ x = a : b}</code> searches between a and b for where f(x) equals c (without <code>= c</code>: where f(x) is zero), <code>&#36;Sup{…}</code> and <code>&#36;Inf{…}</code> find the largest and the smallest value. That too works with units",
    "momentenlijn met de rekenwaarden": "moment diagram with the design values",
    "met &#36;Root: grootste overspanning waarbij de buiging nog voldoet": "with &#36;Root: largest span at which the bending is still OK",
    "met &#36;Sup: grootste moment, gelijk aan M<sub>Ed</sub>": "with &#36;Sup: largest moment, equal to M<sub>Ed</sub>",
    "10.3 Een parametrische kromme": "10.3 A parametric curve",
    "Schrijf <code>x(t)&#124;y(t)</code> om beide coördinaten van een parameter te laten afhangen. Hieronder de interactiekromme van normaalkracht en moment voor een volledig plastische stalen strip van 12 × 150 mm, met de plaats z van de neutrale lijn als parameter; de tweede kromme is het gespiegelde deel voor een negatief moment":
      "Write <code>x(t)&#124;y(t)</code> to make both coordinates depend on a parameter. Below the interaction curve of axial force and moment for a fully plastic steel strip of 12 × 150 mm, with the position z of the neutral axis as the parameter; the second curve is the mirrored part for a negative moment",
    "breedte in mm": "width in mm",
    "hoogte in mm": "depth in mm",
    "vloeigrens in N/mm²": "yield strength in N/mm²",
    "normaalkracht in kN": "axial force in kN",
    "moment in kNm": "moment in kNm",
    "Horizontaal het moment M in kNm, verticaal de normaalkracht N in kN": "Horizontally the moment M in kNm, vertically the axial force N in kN",

    "11. Parametrische tekeningen": "11. Parametric drawings",
    "11.1 Een tekening met waarden: @svg": "11.1 A drawing with values: @svg",
    "Tussen <code>@svg</code> en <code>@end</code> staat een gewone SVG-tekening. Op de plek van <code>&#123;&#123;naam&#125;&#125;</code> komt de waarde van een variabele, zonder eenheid; ook tekst, zoals een kleur. Alleen een naam past daar, geen formule: reken maten daarom eerst verborgen uit":
      "Between <code>@svg</code> and <code>@end</code> is an ordinary SVG drawing. In place of <code>&#123;&#123;naam&#125;&#125;</code> comes the value of a variable, without a unit; also text, such as a colour. Only a name fits there, no formula: so calculate dimensions first, hidden",
    "buiging": "bending",
    "11.2 Een tekening op tekstregels": "11.2 A drawing on text lines",
    "Meer vrijheid geeft een tekening op tekstregels: elke regel begint met een apostrof en is een stukje SVG, met formules tussen apostrofs, zoals <code>&lt;line x1=\"&#39;x_a + 10&#39;\" …/&gt;</code>. Tussen die regels mogen <code>#for</code> en <code>#if</code> staan. Hieronder tekent een herhaling de pijlen van de verdeelde last (meer pijlen bij een langere ligger) en verschijnt de puntlast alleen als die is meegenomen. Verander de overspanning, het profiel of de keuze voor de puntlast in hoofdstuk 3 en de tekening verandert mee":
      "A drawing on text lines gives more freedom: each line starts with an apostrophe and is a piece of SVG, with formulas between apostrophes, such as <code>&lt;line x1=\"&#39;x_a + 10&#39;\" …/&gt;</code>. <code>#for</code> and <code>#if</code> may stand between those lines. Below a loop draws the arrows of the distributed load (more arrows for a longer beam) and the point load appears only if it is included. Change the span, the section or the choice for the point load in chapter 3 and the drawing changes with it",
    "11.3 Kopplaat met bouten (EN 1993-1-8)": "11.3 End plate with bolts (EN 1993-1-8)",
    "Een tekening die door invoer en keuzes wordt gestuurd: de maten van de kopplaat volgen uit het profiel, het aantal boutrijen en de boutmaat kies je hieronder, en de randafstand e<sub>1</sub> bepaalt waar de bouten komen. Het profiel zelf tekent <code>doorsnede_svg(D; 1; x0; y0; schaal)</code>":
      "A drawing driven by input and choices: the dimensions of the end plate follow from the section, you choose the number of bolt rows and the bolt size below, and the edge distance e<sub>1</sub> determines where the bolts go. The section itself is drawn by <code>doorsnede_svg(D; 1; x0; y0; schaal)</code>",
    "Aantal boutrijen": "Number of bolt rows",
    "2 rijen": "2 rows",
    "3 rijen": "3 rows",
    "4 rijen": "4 rows",
    "Bouten, klasse 8.8": "Bolts, class 8.8",
    "bovenrand tot bovenste boutrij": "top edge to top bolt row",
    "afstand van de bovenrand tot de bovenste boutrij": "distance from the top edge to the top bolt row",
    "hoogte kopplaat": "end plate depth",
    "breedte kopplaat": "end plate width",
    "gatdiameter": "hole diameter",
    "randafstand tot de buitenste boutkolom": "edge distance to the outer bolt column",
    "steek tussen de boutrijen": "pitch between the bolt rows",
    "afstand tussen de boutkolommen": "distance between the bolt columns",
    "Rand- en tussenafstanden voldoen aan de minima van tabel 3.3 (e ≥ 1,2·d<sub>0</sub>, p<sub>1</sub> ≥ 2,2·d<sub>0</sub>, p<sub>2</sub> ≥ 2,4·d<sub>0</sub>)": "Edge distances and spacings meet the minima of table 3.3 (e ≥ 1.2·d<sub>0</sub>, p<sub>1</sub> ≥ 2.2·d<sub>0</sub>, p<sub>2</sub> ≥ 2.4·d<sub>0</sub>)",
    "Een rand- of tussenafstand is kleiner dan het minimum van tabel 3.3": "An edge distance or spacing is smaller than the minimum of table 3.3",
    "spanningsdoorsnede uit de verborgen tabel [M; A<sub>s</sub>]": "tensile stress area from the hidden table [M; A<sub>s</sub>]",
    "boutklasse 8.8": "bolt class 8.8",
    "tabel 3.4, schuifvlak door het draadgedeelte": "table 3.4, shear plane through the threaded portion",
    "dwarskracht gelijk verdeeld over alle bouten": "shear force distributed equally over all bolts",
    "kopplaat": "end plate",
    "× 2 bouten M": "× 2 bolts M",
    "Bouten op afschuiving": "Bolts in shear",

    "12. Een afbeelding: @img": "12. An image: @img",
    "Met <code>@img(bestand)</code> voeg je een afbeelding in. Een SVG-tekening die met de app is meegeleverd, komt als tekening in het blad; dit detail is er zo een. Een afbeelding is vast: anders dan de tekeningen van hoofdstuk 11 rekent er niets in mee":
      "With <code>@img(bestand)</code> you insert an image. An SVG drawing supplied with the app appears as a drawing in the sheet; this detail is one of those. An image is fixed: unlike the drawings of chapter 11, nothing in it is calculated",

    "13. Een ruimtelijk beeld: @3d": "13. A 3D view: @3d",
    "Tussen <code>@3d</code> en <code>@end</code> beschrijf je een ruimtelijk beeld, één element per regel: eerst wat het is, dan de maten. x en y liggen horizontaal, z wijst omhoog. <code>ibalk x1 y1 z1 x2 y2 z2 b h tw tf</code> is een I-profiel van punt 1 naar punt 2, <code>balk … b h</code> een rechthoekige balk, <code>kolom x y z0 z1 b h</code> een staande balk, <code>plaat x y z lx ly t</code> een plaat of poer, <code>lijnlast x1 y1 z1 x2 y2 z2 a</code> een rij pijlen van lengte a, <code>pijl x1 y1 z1 x2 y2 z2</code> een puntlast en <code>tekst x y z \"…\"</code> een label. Er zijn ook <code>buis</code>, <code>doos</code>, <code>staaf</code>, <code>knoop</code> en <code>oplegging</code>":
      "Between <code>@3d</code> and <code>@end</code> you describe a 3D view, one element per line: first what it is, then the dimensions. x and y are horizontal, z points upwards. <code>ibalk x1 y1 z1 x2 y2 z2 b h tw tf</code> is an I-section from point 1 to point 2, <code>balk … b h</code> a rectangular beam, <code>kolom x y z0 z1 b h</code> an upright beam, <code>plaat x y z lx ly t</code> a plate or footing, <code>lijnlast x1 y1 z1 x2 y2 z2 a</code> a row of arrows of length a, <code>pijl x1 y1 z1 x2 y2 z2</code> a point load and <code>tekst x y z \"…\"</code> a label. There are also <code>buis</code>, <code>doos</code>, <code>staaf</code>, <code>knoop</code> and <code>oplegging</code>",
    "Een maat is een getal of een formule tussen dubbele accolades: <code>&#123;&#123;L&#125;&#125;</code>, <code>&#123;&#123;H_k + h_p/2&#125;&#125;</code>. Een lengte telt daarin in millimeters (na de regel <code>eenheid m</code> in meters): met L = 5 m geeft <code>&#123;&#123;L/2&#125;&#125;</code> dus 2500. In een tekst komt de waarde zonder eenheid. Achteraan een regel mag een kleur staan, zoals <code>staal</code>, <code>hout</code>, <code>beton</code> of <code>#rrggbb</code>; zonder kleur is een balk staal, een plaat beton en een last amber. <code>#for</code> en <code>#if</code> werken ook in het blok, en <code>camera voor</code>, <code>hoogte 400</code> of <code>raster uit</code> stellen het beeld in":
      "A dimension is a number or a formula between double braces: <code>&#123;&#123;L&#125;&#125;</code>, <code>&#123;&#123;H_k + h_p/2&#125;&#125;</code>. A length counts in millimetres there (after the line <code>eenheid m</code> in metres): with L = 5 m, <code>&#123;&#123;L/2&#125;&#125;</code> therefore gives 2500. In a text the value appears without a unit. A colour may stand at the end of a line, such as <code>staal</code>, <code>hout</code>, <code>beton</code> or <code>#rrggbb</code>; without a colour a beam is steel, a plate concrete and a load amber. <code>#for</code> and <code>#if</code> also work in the block, and <code>camera voor</code>, <code>hoogte 400</code> or <code>raster uit</code> set the view",
    "Hieronder de ligger van dit blad: het gekozen profiel over de overspanning L op twee kolommen van hetzelfde profiel, met de verdeelde last (de pijlen zijn langer bij een grotere last) en, als die is meegenomen, de puntlast in het midden. Verander het profiel, L of de puntlast in hoofdstuk 3 en het beeld verandert mee. In de uitwerking draai je het beeld door te slepen, schuif je met de rechtermuisknop en zoom je na een klik met het wiel; de knoppen rechtsboven zetten het op een vast standpunt. Op papier staat een stilstaande afbeelding":
      "Below the beam of this sheet: the chosen section over the span L on two columns of the same section, with the distributed load (the arrows are longer for a larger load) and, if included, the point load at mid-span. Change the section, L or the point load in chapter 3 and the view changes with it. In the worked-out sheet you rotate the view by dragging, pan with the right mouse button and, after a click, zoom with the wheel; the buttons at the top right set it to a fixed viewpoint. On paper a still image appears",

    "14. Een externe pagina: @iframe": "14. An external page: @iframe",
    "Met <code>@iframe adres hoogte=60mm</code> zet je een externe pagina op de bladbreedte, in de uitwerking en op papier. Een blad kan van iemand anders komen: de pagina laadt pas na een klik op de knop, en alleen van http of https. Tot dan staat er een kader met het adres; dat komt ook op papier als de pagina niet geladen is. Met <code>scripts</code> achter het adres mag de pagina scripts uitvoeren, afgeschermd van de app. In het adres werkt <code>&#123;&#123;L&#125;&#125;</code> ook":
      "With <code>@iframe adres hoogte=60mm</code> you place an external page across the sheet width, in the worked-out sheet and on paper. A sheet may come from someone else: the page loads only after a click on the button, and only from http or https. Until then a frame with the address is shown; it also appears on paper if the page is not loaded. With <code>scripts</code> after the address the page may run scripts, shielded from the app. <code>&#123;&#123;L&#125;&#125;</code> also works in the address",

    "Tussen <code>@js</code> en <code>@end</code> staat gewoon JavaScript. Het loopt pas na een klik op de knop, in een eigen afgeschermd venster: zonder netwerk en zonder toegang tot de app of je bestanden. De waarden van dit blad staan klaar als <code>calc</code>, met hun eenheid. <code>calc.getallen(\"mm\")</code> geeft alles wat een lengte is in millimeters. Met <code>bibliotheek=three</code> is three.js er ook, en maakt <code>calc.wereld3d()</code> een draaibaar beeld. <code>calc.bijWijziging</code> tekent opnieuw als een waarde verandert: de camera blijft dan staan. Pas L, b of h aan en de balk beweegt mee":
      "Between <code>@js</code> and <code>@end</code> is plain JavaScript. It runs only after a click on the button, in its own shielded window: without network and without access to the app or your files. The values of this sheet are ready as <code>calc</code>, with their unit. <code>calc.getallen(\"mm\")</code> gives everything that is a length in millimetres. With <code>bibliotheek=three</code> three.js is available too, and <code>calc.wereld3d()</code> makes a rotatable view. <code>calc.bijWijziging</code> redraws when a value changes: the camera then stays put. Change L, b or h and the beam moves with it",

    "16. Spiekbriefje": "16. Cheat sheet",
    "De schrijfwijzen van dit blad op een rij": "The notations of this sheet at a glance",
    "Schrijfwijze": "Notation",
    "Betekenis": "Meaning",
    "titel van het blad": "title of the sheet",
    "hoofdstuk, paragraaf": "chapter, section",
    "tekstregel, HTML mag; <code>&#39;formule&#39;</code> zet er een waarde in": "text line, HTML allowed; <code>&#39;formule&#39;</code> inserts a value",
    "commentaar, alleen in de editor": "comment, in the editor only",
    "toekenning met eenheid en toelichting": "assignment with unit and note",
    "omrekenen naar een eenheid": "convert to a unit",
    "invoerveld met standaardwaarde": "input field with default value",
    "keuzelijst, per regel <code>tekst = getal</code>": "drop-down list, per line <code>tekst = getal</code>",
    "eigen functie": "user-defined function",
    "voorwaarde": "condition",
    "herhaling met een teller": "loop with a counter",
    "n keer herhalen (teller <code>_i</code>), of zolang een voorwaarde geldt": "repeat n times (counter <code>_i</code>), or as long as a condition holds",
    "een herhaling stoppen": "stop a loop",
    "rekenen zonder te tonen": "calculate without showing",
    "macro met parameters": "macro with parameters",
    "matrix (rijen gescheiden door &#124;), element lezen of toekennen, nulmatrix": "matrix (rows separated by &#124;), read or assign an element, zero matrix",
    "opzoeken in een tabel": "look up in a table",
    "stelsel oplossen, inverse, determinant, getransponeerde": "solve a system, inverse, determinant, transpose",
    "grafiek; meer lijnen met &amp;, kromme met x(t)&#124;y(t), maat met PlotWidth en PlotHeight": "graph; more lines with &amp;, curve with x(t)&#124;y(t), size with PlotWidth and PlotHeight",
    "oplossen, maximum, minimum": "solve, maximum, minimum",
    "<code>@svg</code> … <code>@end</code> met <code>&#123;&#123;naam&#125;&#125;</code>": "<code>@svg</code> … <code>@end</code> with <code>&#123;&#123;naam&#125;&#125;</code>",
    "tekening met waarden": "drawing with values",
    "<code>&#39;&lt;svg …&gt;</code> met <code>&#39;formule&#39;</code>": "<code>&#39;&lt;svg …&gt;</code> with <code>&#39;formule&#39;</code>",
    "parametrische tekening op tekstregels": "parametric drawing on text lines",
    "afbeelding": "image",
    "externe pagina, laadt pas na bevestiging": "external page, loads only after confirmation",
    "JavaScript met de waarden van het blad als <code>calc</code>, afgeschermd, na bevestiging": "JavaScript with the values of the sheet as <code>calc</code>, shielded, after confirmation",
    "constructieve rekenfuncties van de rekenkern": "structural functions of the calculation core",
  },
  namen: {
    g_eg: "g_sw", n_st: "n_bars", W_rh: "W_rect", met_F: "with_F", staal: "steel",
    profiel: "section", profielen: "sections", bout: "bolt", bouten: "bolts", last: "load",
    M_veld: "M_span", x_veld: "x_span", R_som: "R_sum", L_grens: "L_lim",
  },
};
