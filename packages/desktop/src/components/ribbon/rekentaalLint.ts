/**
 * Het tabblad Rekentaal: alle knoppen van de rekentaal in één lintstrook, als
 * een toetsenblok.
 *
 * Alleen syntax die de rekenkern (packages/core) leest. Andere rekentalen kennen meer
 * (`$Map`, `spline`, `∧`, …); zo'n knop komt er pas als de rekenkern het
 * ook kan, anders voegt hij code in die een fout geeft.
 *
 * Veelgebruikte knoppen staan als kleine knop in een stapel van drie, de rest
 * zit achter een grote knop met een uitklapmenu. `tekst` is wat er in de
 * editor komt; tussen ⟨ en ⟩ staat de plaats die je daarna invult (zie
 * invoegen.ts).
 *
 * De woorden zijn sleutels in locales/{nl,en}/rekentaal.json, onder `lint`:
 * `label` in lint.groep, de `naam` van een menu in lint.menu, `kop` in
 * lint.kop en de `naam` van een knop in lint.knop. RekentaalTab vertaalt ze bij
 * het tekenen. `tekst` en `glyph` zijn rekentaal en blijven in elke taal gelijk, op
 * de woorden om te overtypen na (WOORDEN hieronder).
 */

/**
 * De woorden in een fragment die er staan om te overtypen: het woord in `tekst` en zijn
 * sleutel in lint.plek. fragmentInTaal zet ze bij het invoegen in de taal van de app.
 */
const WOORDEN: readonly [patroon: RegExp, sleutel: string][] = [
  [/⟨Titel⟩/g, "Titel"], [/⟨Kop⟩/g, "Kop"], [/⟨tekst⟩/g, "tekst"], [/⟨vet⟩/g, "vet"], [/⟨cursief⟩/g, "cursief"],
  [/⟨onderstreept⟩/g, "onderstreept"], [/⟨opmerking⟩/g, "opmerking"], [/⟨naam\$?⟩/g, "naam"], [/⟨keuze⟩/g, "keuze"],
  [/"Omschrijving"/g, "Omschrijving"], [/Optie (?=\d)/g, "Optie"], [/⟨bestand(?:\.cpd)?⟩/g, "bestand"], [/⟨voorwaarde⟩/g, "voorwaarde"],
  [/⟨Draaibaar model⟩/g, "DraaibaarModel"], [/"waarde"/g, "waarde"],
];

/** Het fragment van een knop met de woorden om te overtypen in de taal van `vertaal`. */
export function fragmentInTaal(tekst: string, vertaal: (sleutel: string) => string): string {
  let uit = tekst;
  for (const [patroon, sleutel] of WOORDEN) {
    uit = uit.replace(patroon, (heel) => {
      const woord = vertaal(sleutel);
      if (heel.startsWith("⟨")) return heel.replace(/⟨([^⟩$.]*)(.*)⟩/, (_m, _w: string, rest: string) => `⟨${woord}${rest}⟩`);
      if (heel.startsWith('"')) return `"${woord}"`;
      return `${woord} `;
    });
  }
  return uit;
}

export interface SyntaxKnop {
  /** Wat in het icoonvak staat: het teken zelf, zoals op het toetsenblok. */
  glyph: string;
  /**
   * Sleutel van het woord naast het teken (lint.knop.…). Zonder sleutel is het
   * teken zelf de naam, zoals bij de Griekse letters.
   */
  naam?: string;
  /** Wat er in de editor komt; ⟨…⟩ is de plaats om in te vullen. */
  tekst: string;
  /** B2-icoon in plaats van het teken, als de Blueprint er een heeft. */
  icoon?: { id: string; sprite: "standard" | "calculations" };
  regel?: boolean;
  spatie?: boolean;
  /** Alleen het teken op de knop, zoals bij eenheden; het woord staat in de tooltip. */
  alleenTeken?: boolean;
  /** Geen vaste tekst maar een handeling: "afbeelding" vraagt eerst om een bestand. */
  actie?: "afbeelding";
}

export interface MenuSectie {
  /** Sleutel van de kop (lint.kop.…). */
  kop: string;
  knoppen: SyntaxKnop[];
  /** Alleen tekens, in een raster (Grieks, operatoren). */
  raster?: boolean;
}

export type LintItem =
  | { soort: "stapel"; knoppen: SyntaxKnop[] }
  /** `naam` is de sleutel van het menu (lint.menu.…). */
  | { soort: "menu"; glyph: string; naam: string; secties: MenuSectie[] };

export interface LintGroep {
  /** Sleutel van het groepslabel (lint.groep.…); ook de React-key. */
  label: string;
  items: LintItem[];
}

const k = (glyph: string, naam: string | undefined, tekst: string, extra: Partial<SyntaxKnop> = {}): SyntaxKnop =>
  ({ glyph, naam, tekst, ...extra });

const fn = (naam: string, args: string, omschrijving: string): SyntaxKnop => {
  const [eerste, ...rest] = args.split(";");
  return k(naam, omschrijving, `${naam}(⟨${eerste.trim()}⟩${rest.length ? ";" + rest.join(";") : ""})`);
};

const eenheid = (glyph: string, naam: string, tekst = glyph): SyntaxKnop =>
  k(glyph, naam, tekst, { spatie: true });

/** Snelknop voor een eenheid: alleen het teken, zoals op het toetsenblok. */
const snel = (glyph: string, naam: string, tekst = glyph): SyntaxKnop =>
  ({ ...eenheid(glyph, naam, tekst), alleenTeken: true });

/** Een los teken; zonder `naam` is het teken zelf de naam. */
const teken = (t: string, naam?: string): SyntaxKnop => k(t, naam, t);

const stapel = (...knoppen: SyntaxKnop[]): LintItem => ({ soort: "stapel", knoppen });
const menu = (glyph: string, naam: string, ...secties: MenuSectie[]): LintItem =>
  ({ soort: "menu", glyph, naam, secties });

const EENHEDEN: MenuSectie[] = [
  {
    kop: "lengteEnDoorsnede",
    knoppen: [
      eenheid("mm", "millimeter"), eenheid("cm", "centimeter"), eenheid("m", "meter"),
      eenheid("mm²", "oppervlak", "mm^2"), eenheid("cm²", "oppervlak", "cm^2"), eenheid("m²", "oppervlak", "m^2"),
      eenheid("mm³", "inhoud", "mm^3"), eenheid("cm³", "weerstandsmoment", "cm^3"),
      eenheid("mm⁴", "traagheidsmoment", "mm^4"), eenheid("cm⁴", "traagheidsmoment", "cm^4"),
    ],
  },
  {
    kop: "krachtEnBelasting",
    knoppen: [
      eenheid("N", "newton"), eenheid("kN", "kilonewton"), eenheid("MN", "meganewton"),
      eenheid("kNm", "moment", "kN*m"), eenheid("Nmm", "moment", "N*mm"),
      eenheid("kN/m", "lijnlast"), eenheid("N/mm", "lijnlast"),
      eenheid("kN/m²", "vlaklast", "kN/m^2"), eenheid("kN/m³", "volumiekGewicht", "kN/m^3"),
    ],
  },
  {
    kop: "spanningEnMassa",
    knoppen: [
      eenheid("N/mm²", "spanning", "N/mm^2"), eenheid("MPa", "megapascal"), eenheid("GPa", "gigapascal"),
      eenheid("kPa", "kilopascal"), eenheid("kg", "kilogram"), eenheid("t", "ton", "tonne"),
      eenheid("kg/m³", "dichtheid", "kg/m^3"), eenheid("kg/m", "massaPerMeter"),
    ],
  },
  {
    kop: "overig",
    knoppen: [
      eenheid("°", "graden", "deg"), eenheid("rad", "radialen"), eenheid("s", "seconde"),
      eenheid("Hz", "hertz"), eenheid("°C", "gradenCelsius", "degC"), eenheid("K", "kelvin"),
      k("to", "omrekenenNaar", " to ⟨kN*m⟩"),
    ],
  },
];

export const REKENTAAL_LINT: LintGroep[] = [
  {
    label: "tekst",
    items: [
      stapel(
        k("\"", "titel", "\"⟨Titel⟩", { regel: true }),
        k("#", "kop", "# ⟨Kop⟩", { regel: true }),
        k("'", "tekst", "'⟨tekst⟩", { regel: true }),
      ),
      stapel(
        k("B", "vet", "<b>⟨vet⟩</b>", { icoon: { id: "format.bold", sprite: "standard" }, alleenTeken: true }),
        k("I", "cursief", "<i>⟨cursief⟩</i>", { icoon: { id: "format.italic", sprite: "standard" }, alleenTeken: true }),
        k("U", "onderstreept", "<u>⟨onderstreept⟩</u>", { icoon: { id: "format.underline", sprite: "standard" }, alleenTeken: true }),
      ),
      stapel(
        k("x₂", "subscript", "<sub>⟨i⟩</sub>", { alleenTeken: true }),
        k("x²", "superscript", "<sup>⟨2⟩</sup>", { alleenTeken: true }),
        k("//", "opmerking", " // ⟨opmerking⟩", { alleenTeken: true }),
      ),
    ],
  },
  {
    label: "invoer",
    items: [
      stapel(
        k("?", "invoerveld", "⟨naam⟩ = ?{1}", { regel: true }),
        k("?kN", "metEenheid", "⟨F⟩ = ?{10}*(kN)", { regel: true }),
        k("▾", "keuzelijst", "@select ⟨keuze⟩ \"Omschrijving\"\n\tOptie 1 = 1\n\tOptie 2 = 2\n@end", { regel: true }),
      ),
      stapel(
        k("[ ]", "matrix", "[⟨a⟩; b | c; d]", { alleenTeken: true }),
        k("img", "afbeeldingKiezen", "@img(⟨bestand⟩)", { regel: true, actie: "afbeelding", icoon: { id: "draw.image", sprite: "standard" } }),
        k("svg", "tekening", "@svg\n\t⟨<rect width=\"100\" height=\"50\"/>⟩\n@end", { regel: true, icoon: { id: "draw.freehand", sprite: "standard" } }),
      ),
      // Een ruimtelijk beeld: twee kolommen met een balk erover (zie core/src/drieD.ts).
      stapel(
        k("3D", "drieD", "@3d\n\t⟨kolom 0 0 0 3000 200 200⟩\n\tkolom 5000 0 0 3000 200 200\n\tbalk 0 0 3150 5000 0 3150 200 300 hout\n@end", { regel: true, icoon: { id: "view.orbit", sprite: "standard" } }),
        // Een externe pagina, eerst als kader met een knop (zie core/src/iframeBlok.ts).
        k("web", "iframe", "@iframe ⟨https://⟩ hoogte=120mm", { regel: true, icoon: { id: "link.open-external", sprite: "standard" } }),
        // Een draaibaar model in een paar regels; loopt pas na een klik, afgeschermd (zie core/src/jsBlok.ts).
        k("js", "javascript", "@js hoogte=80mm titel=\"⟨Draaibaar model⟩\" bibliotheek=three\nconst w = calc.wereld3d();\nw.doos([0, -50, 0], [3000, 50, 200], \"#e3c08a\");\nw.doos([-100, -150, -300], [100, 150, 0], \"#c9c5bd\");\nw.doos([2900, -150, -300], [3100, 150, 0], \"#c9c5bd\");\nw.teken();\n@end", { regel: true, icoon: { id: "view.orbit", sprite: "standard" } }),
      ),
    ],
  },
  {
    label: "programma",
    items: [
      // Direct zichtbaar wat je het meest typt: voorwaarde, lus, functie.
      stapel(
        k("#if", "alsDan", "#if ⟨voorwaarde⟩\n\t\n#end if", { regel: true, alleenTeken: true }),
        k("#else", "anders", "#else", { regel: true, alleenTeken: true }),
        k("#else if", "andersAls", "#else if ⟨voorwaarde⟩", { regel: true, alleenTeken: true }),
      ),
      stapel(
        k("#for", "tellerVanTot", "#for ⟨i⟩ = 1 : n\n\t\n#loop", { regel: true, alleenTeken: true }),
        k("#repeat", "herhaalNKeer", "#repeat ⟨n⟩\n\t\n#loop", { regel: true, alleenTeken: true }),
        k("#break", "lusVerlaten", "#break", { regel: true, alleenTeken: true }),
      ),
      stapel(
        k("f(x) =", "eigenFunctie", "⟨f⟩(x) = x^2", { regel: true, alleenTeken: true }),
        k("#def", "macroMetParameters", "#def ⟨naam⟩(a; b)\n\t\n#end def", { regel: true, alleenTeken: true }),
        k("#include", "anderBestand", "#include ⟨bestand.cpd⟩", { regel: true, alleenTeken: true }),
      ),
      menu("#", "meer",
        {
          kop: "afsluiten",
          knoppen: [
            k("#end if", "eindeVoorwaarde", "#end if", { regel: true }),
            k("#loop", "eindeFor", "#loop", { regel: true }),
            k("#while", "zolangAls", "#while ⟨voorwaarde⟩\n\t\n#loop", { regel: true }),
            k("#continue", "volgendeRonde", "#continue", { regel: true }),
            k("#def =", "tekstconstante", "#def ⟨naam$⟩ = \"waarde\"", { regel: true }),
          ],
        },
        {
          kop: "tonen",
          knoppen: [
            k("#hide", "nietTonen", "#hide", { regel: true }),
            k("#show", "weerTonen", "#show", { regel: true }),
            k("#pre", "alleenInInvoer", "#pre", { regel: true }),
            k("#post", "alleenInUitkomst", "#post", { regel: true }),
            k("#val", "alleenUitkomst", "#val", { regel: true }),
            k("#equ", "formuleEnUitkomst", "#equ", { regel: true }),
            k("#noc", "alleenFormule", "#noc", { regel: true }),
            k("#nosub", "zonderInvulling", "#nosub", { regel: true }),
          ],
        },
        {
          kop: "hoeken",
          knoppen: [
            k("#deg", "graden", "#deg", { regel: true }),
            k("#rad", "radialen", "#rad", { regel: true }),
            k("#gra", "gon", "#gra", { regel: true }),
          ],
        },
        {
          kop: "decimalen",
          knoppen: [
            k(":F0", "geenDecimalen", ":F0"),
            k(":F1", "eenDecimaal", ":F1"),
            k(":F2", "tweeDecimalen", ":F2"),
            k(":F3", "drieDecimalen", ":F3"),
            k("#round", "afrondenVanaf", "#round ⟨2⟩", { regel: true }),
          ],
        },
      ),
    ],
  },
  {
    label: "rekenen",
    items: [
      // Operatoren als tekenknop, de meestgebruikte functies ernaast; de
      // volledige lijsten in de menu's.
      stapel(
        k("+", "plus", " + ", { alleenTeken: true }),
        k("−", "min", " - ", { alleenTeken: true }),
        k("×", "maal", "*", { alleenTeken: true }),
      ),
      stapel(
        k("/", "gedeeldDoor", "/", { alleenTeken: true }),
        k("^", "macht", "^", { alleenTeken: true }),
        k("( )", "haakjes", "(⟨x⟩)", { alleenTeken: true }),
      ),
      stapel(
        k("≤", "kleinerOfGelijk", " ≤ ", { alleenTeken: true }),
        k("≥", "groterOfGelijk", " ≥ ", { alleenTeken: true }),
        k("≠", "nietGelijk", " ≠ ", { alleenTeken: true }),
      ),
      stapel(
        k("√", "wortel", "sqrt(⟨x⟩)", { alleenTeken: true }),
        k("|x|", "absoluteWaarde", "abs(⟨x⟩)", { alleenTeken: true }),
        k("max", "grootste", "max(⟨a⟩; b)", { alleenTeken: true }),
      ),
      stapel(
        k("min", "kleinste", "min(⟨a⟩; b)", { alleenTeken: true }),
        k("if", "alsDanAnders", "if(⟨voorwaarde⟩; a; b)", { alleenTeken: true }),
        k("π", "pi", "π", { alleenTeken: true }),
      ),
      menu("±", "operator", {
        kop: "operatoren",
        raster: true,
        knoppen: [
          k("+", "plus", " + "), k("−", "min", " - "), k("×", "maal", "*"), k("/", "gedeeldDoor", "/"),
          k("^", "macht", "^"), k("( )", "haakjes", "(⟨x⟩)"), k("!", "faculteit", "!"),
          k("≡", "gelijk", " ≡ "), k("≠", "nietGelijk", " ≠ "),
          k("<", "kleinerDan", " < "), k(">", "groterDan", " > "),
          k("≤", "kleinerOfGelijk", " ≤ "), k("≥", "groterOfGelijk", " ≥ "),
        ],
      }),
      menu("[ ]", "matrix",
        {
          kop: "matrixMaken",
          knoppen: [
            k("[a; b | c; d]", "matrixLiteraal", "[⟨a⟩; b | c; d]"),
            k("matrix", "nulmatrix", "matrix(⟨m⟩; n)"),
            k("vector", "nulvector", "vector(⟨n⟩)"),
            k("A.(i; j) =", "elementToekennen", "⟨A⟩.(i; j) = ", { regel: true }),
            k("v.(i)", "elementLezen", "⟨v⟩.(i)"),
          ],
        },
        {
          kop: "matrixRekenen",
          knoppen: [
            fn("lsolve", "A; b", "stelselOplossen"), fn("msolve", "A; B", "meerdereRechterleden"),
            fn("transp", "A", "getransponeerde"), fn("inverse", "A", "inverseMatrix"),
            fn("det", "A", "determinant"), fn("rank", "A", "rang"), fn("trace", "A", "spoor"),
            fn("eigenvals", "A", "eigenwaarden"), fn("len", "v", "lengteVector"),
            fn("n_rows", "A", "aantalRijen"), fn("n_cols", "A", "aantalKolommen"),
          ],
        },
      ),
      menu("ƒx", "functie",
        {
          kop: "wiskunde",
          knoppen: [
            fn("sqrt", "x", "wortel"), fn("cbrt", "x", "derdemachtswortel"),
            k("nthRoot", "nDeMachtswortel", "nthRoot(⟨x⟩; n)"),
            fn("abs", "x", "absoluteWaarde"), fn("sign", "x", "teken"),
            fn("exp", "x", "eTotDeMacht"), k("ln", "natuurlijkeLogaritme", "ln(⟨x⟩)"),
            fn("lg", "x", "tiendeligeLogaritme"), fn("round", "x; 2", "afronden"),
            fn("floor", "x", "naarBeneden"), fn("ceil", "x", "naarBoven"),
            fn("min", "a; b", "kleinste"), fn("max", "a; b", "grootste"), fn("mod", "a; b", "restNaDeling"),
          ],
        },
        {
          kop: "goniometrie",
          knoppen: [
            fn("sin", "α", "sinus"), fn("cos", "α", "cosinus"), fn("tan", "α", "tangens"), fn("cot", "α", "cotangens"),
            fn("asin", "x", "boogsinus"), fn("acos", "x", "boogcosinus"), fn("atan", "x", "boogtangens"),
            fn("atan2", "y; x", "hoekVanVector"),
            fn("sinh", "x", "sinusHyperbolicus"), fn("cosh", "x", "cosinusHyperbolicus"), fn("tanh", "x", "tangensHyperbolicus"),
          ],
        },
        {
          kop: "tabellenEnLogica",
          knoppen: [
            fn("take", "n; a; b; c", "nDeUitLijst"), fn("hlookup", "M; waarde; 1; 2", "zoekInRij"),
            fn("vlookup", "M; waarde; 1; 2", "zoekInKolom"), fn("get", "M; i; j", "elementUitMatrix"),
            fn("n_rows", "M", "aantalRijen"), fn("n_cols", "M", "aantalKolommen"),
            fn("if", "voorwaarde; a; b", "alsDanAnders"),
            fn("and", "a; b", "en"), fn("or", "a; b", "of"), fn("not", "a", "niet"), fn("xor", "a; b", "exclusiefOf"),
          ],
        },
        {
          kop: "constructief",
          knoppen: [
            fn("ligger", "geo; last; EI", "liggerOplossen"), fn("ligger_R", "geo; last; EI", "reactiesPerSteunpunt"),
            fn("ligger_omh", "geo; last; EI; groep; f1; f2", "omhullendeMV"),
            fn("raamwerk", "knopen; staven; opleggingen; lasten", "vlakRaamwerk"),
            fn("doorsnede", "delen", "samengesteldeDoorsnede"),
          ],
        },
      ),
    ],
  },
  {
    // Grafieken en numerieke oplossers, direct zichtbaar.
    label: "analyse",
    items: [
      stapel(
        k("$Plot", "grafiekVanFx", "$Plot{⟨f(x)⟩ @ x = 0 : 10}", { regel: true, icoon: { id: "data.chart", sprite: "standard" }, alleenTeken: true }),
        k("$Plot &", "tweeGrafieken", "$Plot{⟨f(x)⟩ & g(x) @ x = 0 : 10}", { regel: true, alleenTeken: true }),
        k("$Plot |", "parametrischeGrafiek", "$Plot{⟨x(t)⟩|y(t) @ t = 0 : 1}", { regel: true, alleenTeken: true }),
      ),
      stapel(
        k("$Find", "nulpuntTussenGrenzen", "$Find{⟨f(x)⟩ @ x = 0 : 10}", { alleenTeken: true }),
        k("$Root", "nulpuntAlsFind", "$Root{⟨f(x)⟩ @ x = 0 : 10}", { alleenTeken: true }),
        k("$Solve", "nulpuntVanafBeginwaarde", "$Solve{⟨f(x)⟩ @ x = 1}", { alleenTeken: true }),
      ),
      stapel(
        k("$Sup", "grootsteWaarde", "$Sup{⟨f(x)⟩ @ x = 0 : 10}", { alleenTeken: true }),
        k("$Inf", "kleinsteWaarde", "$Inf{⟨f(x)⟩ @ x = 0 : 10}", { alleenTeken: true }),
        k("$Area", "oppervlakOnderKromme", "$Area{⟨f(x)⟩ @ x = 0 : 10}", { alleenTeken: true }),
      ),
      stapel(
        k("$Sum", "som", "$Sum{⟨f(k)⟩ @ k = 1 : n}", { alleenTeken: true }),
        k("$Product", "product", "$Product{⟨f(k)⟩ @ k = 1 : n}", { alleenTeken: true }),
        k("$Slope", "helling", "$Slope{⟨f(x)⟩ @ x = 1}", { alleenTeken: true }),
      ),
    ],
  },
  {
    label: "eenheden",
    items: [
      stapel(snel("mm", "lengte"), snel("kN", "kracht"), snel("kNm", "moment", "kN*m")),
      stapel(snel("N/mm²", "spanning", "N/mm^2"), snel("kN/m", "lijnlast"), snel("kN/m²", "vlaklast", "kN/m^2")),
      menu("m²", "eenheid", ...EENHEDEN),
    ],
  },
  {
    label: "symbolen",
    items: [
      menu("α", "grieks",
        { kop: "kleineLetters", raster: true, knoppen: "αβγδεζηθικλμνξπρστυφχψω".split("").map((c) => teken(c)) },
        { kop: "hoofdletters", raster: true, knoppen: "ΓΔΘΛΞΠΣΦΨΩ".split("").map((c) => teken(c)) },
      ),
      menu("x_d", "index",
        {
          kop: "indices",
          knoppen: [
            k("_d", "rekenwaarde", "_d"), k("_k", "karakteristiek", "_k"),
            k("_Ed", "belastingRekenwaarde", "_Ed"), k("_Rd", "weerstandRekenwaarde", "_Rd"),
            k("_y", "omYAs", "_y"), k("_z", "omZAs", "_z"),
          ],
        },
        {
          kop: "tekensInTekst",
          raster: true,
          knoppen: [teken("°", "graden"), teken("⌀", "diameter"), teken("±", "plusMin"), teken("≈", "ongeveer"), teken("·", "maal"), teken("→", "pijl")],
        },
      ),
    ],
  },
];
