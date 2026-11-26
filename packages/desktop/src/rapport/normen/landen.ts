/**
 * Welke normen waar gelden: per land of regio per onderwerp de norm, de uitgever, de editie
 * en een link naar de officiële bron, en welke grootheid de locatie levert voor wind,
 * sneeuw en aardbeving. Stand 05-11-2026. Alleen gegevens: de keuzes staan in keuze.ts.
 *
 * Wat erin staat is nagekeken bij een officiële bron of een duidelijk betrouwbare bron
 * (universiteit, brancheorganisatie). Wat dat niet haalt, staat er zo in:
 *   - `editie: null`: de aanduiding is bevestigd, de editie nog niet;
 *   - `bevestigd: false`: de grootheid komt alleen uit een secundaire bron of een concept;
 *   - `geenGrootheid`: er is aantoonbaar niets in te vullen, en `opmerking` zegt waarom;
 *   - geen `grootheden` en geen `geenGrootheid`: niet vastgesteld, dan een vrij veld.
 *
 * Geen zonekaarten en geen waarden per plaats: die staan in de nationale bijlagen en zijn
 * niet van ons. Geen namen van externe rekensoftware of commerciële zone-diensten, ook
 * niet als bron. Een nieuwe bron moet langs de lijst in scripts/check-normen.mjs.
 *
 * Elke regel moet op papier passen (ook dat bewaakt de controle): de aanduiding en de editie
 * staan samen op één regel van zeven kolommen.
 */
import { mt, type Meertalig } from "../meertalig.ts";

export type Onderwerp = "belastingen" | "wind" | "sneeuw" | "aardbeving" | "beton" | "staal" | "hout" | "metselwerk" | "funderingen";

export const ONDERWERPEN: readonly Onderwerp[] = ["belastingen", "wind", "sneeuw", "aardbeving", "beton", "staal", "hout", "metselwerk", "funderingen"];

/** De onderwerpen waarvoor de locatie een waarde levert. */
export type LocatieOnderwerp = "wind" | "sneeuw" | "aardbeving";

export const LOCATIE_ONDERWERPEN: readonly LocatieOnderwerp[] = ["wind", "sneeuw", "aardbeving"];

/** De Eurocodes zonder een nationale keuze of een eigen regeling die voorgaat. */
export type Stelsel = "eurocode" | "eigen";

export interface Norm {
  aanduiding: string;
  uitgever: string;
  /** null: de aanduiding is bevestigd, de editie nog niet. Op het scherm en op papier staat dat erbij. */
  editie: string | null;
  url: string;
  opmerking?: Meertalig;
}

export interface Grootheid {
  /** Sleutel in de invoer van het rapport: geen punt, en niet alleen cijfers (leesPad). */
  id: string;
  /** Zoals de norm hem schrijft, met een onderstreping voor de index; leeg bij een zone of klasse. */
  symbool: string;
  naam: Meertalig;
  eenheid: string;
  url: string;
  /** false: alleen een secundaire bron of een concept; "nog te bevestigen" op het scherm. */
  bevestigd: boolean;
}

export interface Locatie {
  grootheden: readonly Grootheid[];
  /** Een officiële, openbare plek met de waarden, als die er is. Alleen een link; de app haalt niets op. */
  waardenUrl?: string;
  opmerking?: Meertalig;
  /** Er is aantoonbaar geen grootheid om in te vullen. */
  geenGrootheid?: boolean;
}

export interface Land {
  /** ISO-regiocode, of GEEN_BIJLAGE. */
  code: string;
  naam: Meertalig;
  stelsel: Stelsel;
  /** Wat op het voorblad komt bij "toegepaste normen" (Rapport.normen). */
  normenTekst: Meertalig;
  /** Wie wat aanwijst, en of dat wettelijk is. */
  aanwijzing: { tekst: Meertalig; url: string };
  normen: Readonly<Record<Onderwerp, Norm>>;
  locatie: Readonly<Record<LocatieOnderwerp, Locatie>>;
}

const n = (aanduiding: string, uitgever: string, editie: string | null, url: string, opmerking?: Meertalig): Norm => ({
  aanduiding, uitgever, editie, url, ...(opmerking ? { opmerking } : {}),
});

const g = (id: string, symbool: string, naam: Meertalig, eenheid: string, url: string, bevestigd = true): Grootheid => ({
  id, symbool, naam, eenheid, url, bevestigd,
});

// ── Eurocode: de grootheden zoals de EN ze noemt ────────────────────────────

const JRC = "https://eurocodes.jrc.ec.europa.eu/EN-Eurocodes";
const JRC_WIND = "https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1991_4_Hansen.pdf";
const JRC_SNEEUW = "https://eurocodes.jrc.ec.europa.eu/sites/default/files/2021-12/handbook3.pdf";
const JRC_AARDBEVING = "https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1998_1_Carvalho.pdf";

const VB0 = mt("normen.grootheden.vb0");
const SK = mt("normen.grootheden.sk");
const AGR = mt("normen.grootheden.agr");
const vb0 = (url: string, bevestigd = true) => g("v_b0", "v_b,0", VB0, "m/s", url, bevestigd);
const sk = (url: string, bevestigd = true) => g("s_k", "s_k", SK, "kN/m²", url, bevestigd);
const agr = (url: string, bevestigd = true) => g("a_gR", "a_gR", AGR, "m/s²", url, bevestigd);

export const GEEN_BIJLAGE = "EUROCODE";

/** De overgang naar de tweede generatie. Bron: CEN/TC 250 N3659 via het JRC. */
export const OVERGANG = {
  publicatie: "30-09-2027",
  intrekking: "30-03-2028",
  url: "https://eurocodes.jrc.ec.europa.eu/second-generation-eurocodes",
} as const;

/**
 * De tweede generatie, voor zover het JRC laat zien dat CEN de delen heeft uitgegeven; het
 * jaar is dat van de EN. Nationale bijlagen staan hier niet: die komen uiterlijk op
 * OVERGANG.publicatie. Van EN 1991-1-4 en EN 1995-1-1 is het jaar niet aantoonbaar.
 */
export const TWEEDE_GENERATIE: Readonly<Record<Onderwerp, Norm>> = {
  belastingen: n("EN 1990; EN 1991-1-1", "CEN", "2023; 2025", OVERGANG.url),
  wind: n("EN 1991-1-4", "CEN", null, OVERGANG.url),
  sneeuw: n("EN 1991-1-3", "CEN", "2025", OVERGANG.url),
  aardbeving: n("EN 1998-1-1", "CEN", "2024", OVERGANG.url),
  beton: n("EN 1992-1-1", "CEN", "2023", OVERGANG.url),
  staal: n("EN 1993-1-1", "CEN", "2022", OVERGANG.url),
  hout: n("EN 1995-1-1", "CEN", null, OVERGANG.url),
  metselwerk: n("EN 1996-1-1", "CEN", "2022", OVERGANG.url),
  funderingen: n("EN 1997-1", "CEN", "2024", OVERGANG.url),
};

/** Op het voorblad bij de tweede generatie; de nationale bijlagen moeten daar nog bij. */
export const TWEEDE_GENERATIE_TEKST: Meertalig = mt("normen.TWEEDE_GENERATIE_TEKST");

// ── De landen ───────────────────────────────────────────────────────────────

const OMGEVINGSREGELING = "https://wetten.overheid.nl/BWBR0045528/2026-10-06#BijlageII";
const NBN = "https://www.nbn.be/en/article/eurocodes-fundament";
const DIBT = "https://www.dibt.de/de/wir-bieten/technische-baubestimmungen/";
const DIBT_LIJST = "https://www.dibt.de/fileadmin/dibt-website/Dokumente/Referat/P5/Technische_Bestimmungen";
const BSI = "https://knowledge.bsigroup.com/products";
const IE_TII = "https://cdn.tii.ie/publications/DN-STR-03020-01.pdf";
const IE_SHOP = "https://shop.standards.ie/en-ie/standards";
const DK_BRON = "https://www.bygningsreglementet.dk/nationale-annekser/nationale-annekser/nationale-annekser/";
const SE_BRON = "https://rinfo.boverket.se/BFS2024-6/pdf/BFS2024-6.pdf";
const NO_BRON = "https://standard.no/fagomrader/eurokoder";
const FI_BRON = "https://ym.fi/en/-/building-codes";
const FI_KUORMAT = "https://ym.fi/documents/1410903/38439968/Kuormat_lisays_2019-5070311E_F267_47BC_A593_AEAA20EA31FE-153592.pdf";
const AT_BRON = "https://www.austrian-standards.at/en/shop";
const ES_CTE = "https://www.codigotecnico.org/DocumentosCTE/SeguridadEstructural.html";
const ES_DB = "https://www.codigotecnico.org/pdf/Documentos/SE/DBSE-AE.pdf";
const ES_NCSE = "https://www.boe.es/boe/dias/2002/10/11/pdfs/A35898-35967.pdf";
const IT_NTC = "https://www.gazzettaufficiale.it/eli/gu/2018/02/20/42/so/8/sg/pdf";
const PL_PKN = "https://wiedza.pkn.pl/documents/14137/31883/Za%C5%82%C4%85cznik+B_Eurokody.pdf/97bf1e36-2c0c-4f50-8ed5-01c068ddd995";
const US_ICC = "https://shop.iccsafe.org/part-1-an-overview-of-the-structural-changes-to-the-2024-ibc.html";
const US_VOORBEELD = "https://shop.iccsafe.org/media/wysiwyg/material/3010S242-Sample.pdf";
const US_LASTEN = "https://www.iccsafe.org/wp-content/uploads/DemystifyingLoads_24IBC_ASCE7-22_EC-85122-Part1.pdf";
const CA_NBC = "https://nrc-publications.canada.ca/eng/view/ft/?id=adf1ad94-7ea8-4b08-a19f-653ebb7f45f6";
const CH_SIA = "https://cms.sia.ch/de/api/getMedia/674";
const AU_NCC = "https://ncc.abcb.gov.au/editions/ncc-2025/adopted/volume-one/2-referenced-documents/referenced-documents";
const NZ_VM1 = "https://www.building.govt.nz/assets/Uploads/building-code-compliance/b-stability/b1-structure/asvm/b1-structure-vm1-second-edition.pdf";
const NZ_HUB = "https://codehub.building.govt.nz/resources/b1vm1-second-edition";
const bis = (commissie: string) => `https://www.services.bis.gov.in/php/BIS_2.0/dgdashboard/published/standards?aspect=&commttid=${commissie}&commttname=&from=&to=`;

export const LANDEN: readonly Land[] = [
  {
    code: "NL",
    naam: mt("normen.landen.NL.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.NL.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.NL.tekst"),
      url: OMGEVINGSREGELING,
    },
    normen: {
      belastingen: n("NEN-EN 1990; NEN-EN 1991-1-1", "NEN", "2019 + A1:2019 C2:2019 + NB:2019; 2019 + C1:2019 + NB:2019", OMGEVINGSREGELING),
      wind: n("NEN-EN 1991-1-4", "NEN", "2019 + A1 + C2:2011 + NB:2019", OMGEVINGSREGELING),
      sneeuw: n("NEN-EN 1991-1-3", "NEN", "2019 + C1:2019 + A1:2019 + NB:2019", OMGEVINGSREGELING),
      aardbeving: n("NPR 9998", "NEN", "2020", "https://www.nen.nl/bouw/constructieve-veiligheid/aardbevingsbestendig-bouwen", mt("normen.landen.NL.opmerking")),
      beton: n("NEN-EN 1992-1-1", "NEN", "2011 + C2:2011 + A1:2015 + NB:2016 + A1:2020", OMGEVINGSREGELING),
      staal: n("NEN-EN 1993-1-1", "NEN", "2006 + C2 + A1:2016 + NB:2016", OMGEVINGSREGELING),
      hout: n("NEN-EN 1995-1-1", "NEN", "2005 + C1 + A1:2011 + C1:2012 + A2:2014 + NB:2013", OMGEVINGSREGELING),
      metselwerk: n("NEN-EN 1996-1-1", "NEN", "2006 + A1:2013 + NB:2018", OMGEVINGSREGELING),
      funderingen: n("NEN-EN 1997-1", "NEN", "2005 + C1 + A1:2016 + NB:2019", OMGEVINGSREGELING),
    },
    locatie: {
      wind: { grootheden: [vb0(OMGEVINGSREGELING)] },
      sneeuw: { grootheden: [sk(OMGEVINGSREGELING)] },
      aardbeving: {
        grootheden: [],
        geenGrootheid: true,
        opmerking: mt("normen.landen.NL.opmerking2"),
      },
    },
  },
  {
    code: GEEN_BIJLAGE,
    naam: mt("normen.landen.EUROCODE.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.EUROCODE.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.EUROCODE.tekst"),
      url: `${JRC}/eurocode-basis-structural-design`,
    },
    normen: {
      belastingen: n("EN 1990; EN 1991-1-1", "CEN", "2002 + A1:2005; 2002", `${JRC}/eurocode-basis-structural-design`),
      wind: n("EN 1991-1-4", "CEN", "2005", `${JRC}/eurocode-1-actions-structures`),
      sneeuw: n("EN 1991-1-3", "CEN", "2003", `${JRC}/eurocode-1-actions-structures`),
      aardbeving: n("EN 1998-1", "CEN", "2004", `${JRC}/eurocode-8-design-structures-earthquake-resistance`),
      beton: n("EN 1992-1-1", "CEN", "2004", `${JRC}/eurocode-2-design-concrete-structures`),
      staal: n("EN 1993-1-1", "CEN", "2005", `${JRC}/eurocode-3-design-steel-structures`),
      hout: n("EN 1995-1-1", "CEN", "2004", `${JRC}/eurocode-5-design-timber-structures`),
      metselwerk: n("EN 1996-1-1", "CEN", "2005", `${JRC}/eurocode-6-design-masonry-structures`),
      funderingen: n("EN 1997-1", "CEN", "2004", `${JRC}/eurocode-7-geotechnical-design`),
    },
    locatie: {
      wind: { grootheden: [vb0(JRC_WIND)] },
      sneeuw: { grootheden: [sk(JRC_SNEEUW)] },
      aardbeving: { grootheden: [agr(JRC_AARDBEVING)] },
    },
  },
  {
    code: "AT",
    naam: mt("normen.landen.AT.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.AT.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.AT.tekst"),
      url: "https://www.oib.or.at/kernaufgaben/oib-richtlinien/",
    },
    normen: {
      belastingen: n("ÖNORM B 1990-1; ÖNORM B 1991-1-1", "Austrian Standards", "2013-01-01; 2020-12-01", `${AT_BRON}/onorm-b-1990-1-2013-01-01~p1981482`),
      wind: n("ÖNORM B 1991-1-4", "Austrian Standards", "2023-04-01", `${AT_BRON}/onorm-b-1991-1-4-2023-04-01~p2882487`),
      sneeuw: n("ÖNORM B 1991-1-3", "Austrian Standards", "2022-05-15", `${AT_BRON}/onorm-b-1991-1-3-2018-12-01~p2449640`),
      aardbeving: n("ÖNORM B 1998-1", "Austrian Standards", "2017-07-01", `${AT_BRON}/onorm-b-1998-1-2017-07-01~p2314984`),
      beton: n("ÖNORM B 1992-1-1", "Austrian Standards", "2018-01-01", `${AT_BRON}/onorm-b-1992-1-1-2018-01-01~p2354397`),
      staal: n("ÖNORM B 1993-1-1", "Austrian Standards", "2017-11-01", `${AT_BRON}/onorm-b-1993-1-1-2017-11-01~p2342334`),
      hout: n("ÖNORM B 1995-1-1", "Austrian Standards", "2023-08-15", `${AT_BRON}/onorm-b-1995-1-1-2023-08-15~p2670783`),
      metselwerk: n("ÖNORM B 1996-1-1", "Austrian Standards", "2016-07-01", `${AT_BRON}/onorm-b-1996-1-1-2016-07-01~p2432202`),
      funderingen: n("ÖNORM B 1997-1-1", "Austrian Standards", "2021-06-01", `${AT_BRON}/onorm-b-1997-1-1-2021-06-01~p2580313`),
    },
    locatie: {
      // Alleen uit een scriptie van de Universität Innsbruck.
      wind: {
        grootheden: [
          vb0("https://ulb-dok.uibk.ac.at/download/pdf/6011482.pdf", false),
          g("q_b0", "q_b,0", mt("normen.landen.AT.qb0"), "kN/m²", "https://ulb-dok.uibk.ac.at/download/pdf/6011482.pdf", false),
        ],
      },
      sneeuw: { grootheden: [sk("https://www.wko.at/oe/gewerbe-handwerk/dachdecker/grundregelndachdeckerhandwerkeendfassung2013.pdf")] },
      // Alleen uit het concept van 2005.
      aardbeving: { grootheden: [agr("https://meinnormenradar.austrian-standards.at/Preview.action?deliver=&dokkey=97215&selectedLocale=de", false)] },
    },
  },
  {
    code: "AU",
    naam: mt("normen.landen.AU.naam"),
    stelsel: "eigen",
    normenTekst: mt("normen.landen.AU.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.AU.tekst"),
      url: "https://ncc.abcb.gov.au/ncc-2025/ncc-2025-state-and-territory-adoption-information",
    },
    normen: {
      belastingen: n("AS/NZS 1170.0; AS/NZS 1170.1", "Standards Australia", "2002 (A1, A3, A4); 2002 (A1, A2)", AU_NCC),
      wind: n("AS/NZS 1170.2", "Standards Australia", "2021 (A1, A2)", AU_NCC),
      sneeuw: n("AS/NZS 1170.3", "Standards Australia", "2003 (A1, A2)", AU_NCC),
      aardbeving: n("AS 1170.4", "Standards Australia", "2024", AU_NCC),
      beton: n("AS 3600", "Standards Australia", "2018 (A1, A2)", AU_NCC),
      staal: n("AS 4100", "Standards Australia", "2020", AU_NCC),
      hout: n("AS 1720.1", "Standards Australia", "2010 (A1 to A3)", AU_NCC),
      metselwerk: n("AS 3700", "Standards Australia", "2018", AU_NCC),
      funderingen: n("AS 2159; AS 2870; AS 4678", "Standards Australia", "2009 (A1); 2011; 2002", AU_NCC),
    },
    locatie: {
      wind: {
        grootheden: [
          g("regio", "", mt("normen.landen.AU.regio"), "", "https://ncc.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/11-western-australia/23-changes-asnzs-117022021-and-40552021"),
          g("V_R", "V_R", mt("normen.landen.AU.VR"), "m/s", "https://ncc.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/11-western-australia/23-changes-asnzs-117022021-and-40552021"),
        ],
      },
      // Alleen bevestigd via de Nieuw-Zeelandse toezichthouder, bij dezelfde gezamenlijke norm.
      sneeuw: { grootheden: [g("s_g", "s_g", mt("normen.landen.AU.sg"), "kPa", "https://www.building.govt.nz/building-code-compliance/b-stability/b1-structure/minimum-ground-snow-loads-clarified", false)] },
      aardbeving: { grootheden: [g("Z", "Z", mt("normen.landen.AU.Z"), "g", "https://aees.org.au/wp-content/uploads/2025/11/53.-Trevor-Allen.pdf")] },
    },
  },
  {
    code: "BE",
    naam: mt("normen.landen.BE.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.BE.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.BE.tekst"),
      url: NBN,
    },
    normen: {
      belastingen: n("NBN EN 1990 ANB; NBN EN 1991-1-1 ANB", "NBN", "2021; 2007", "https://app.nbn.be/data/r/platform/frontend/detail?p40_id=351534&p40_language_code=nl&p40_detail_id=113589&lang=nl"),
      wind: n("NBN EN 1991-1-4 ANB", "NBN", "2010", "https://app.nbn.be/data/r/platform/frontend/detail?p40_id=349501&p_lang=en"),
      sneeuw: n("NBN EN 1991-1-3 ANB", "NBN", "2007", "https://app.nbn.be/data/r/platform/frontend/detail?p40_id=349437&p40_language_code=nl&p40_detail_id=112555"),
      aardbeving: n("NBN EN 1998-1 ANB", "NBN", "2011", "https://app.nbn.be/data/r/platform/frontend/detail?p40_id=349561&p40_language_code=en&p40_detail_id=112665"),
      beton: n("NBN EN 1992-1-1 ANB", "NBN", "2010", "https://app.nbn.be/data/r/platform/frontend/detail?p40_id=349483&p40_language_code=fr&p40_detail_id=112577"),
      staal: n("NBN EN 1993-1-1 ANB", "NBN", "2018", "https://app.nbn.be/shop/en/standard/nbn-en-1993-1-1-anb-2018_24670"),
      hout: n("NBN EN 1995-1-1 ANB", "NBN", "2012", "https://www.buildwise.be/fr/normes-et-reglementations/chercher/nbn-en-1995-1-1-anb-fr/"),
      metselwerk: n("NBN EN 1996-1-1+A1 ANB", "NBN", "2016", "https://app.nbn.be/data/r/platform/frontend/detail?p40_id=349914&p40_language_code=nl&p40_detail_id=113034"),
      funderingen: n("NBN EN 1997-1 ANB", "NBN", "2022", "https://app.nbn.be/shop/en/standard/nbn-en-1997-1-anb-2022_106528"),
    },
    locatie: {
      // Alleen uit een presentatie in een universitair archief.
      wind: { grootheden: [vb0("https://lirias.kuleuven.be/retrieve/526288", false)] },
      sneeuw: { grootheden: [sk("https://www.buildwise.be/media/e5jfw02o/nbn-en-1991-1-3.pdf")] },
      // De naam is bevestigd, het symbool en de eenheid in de ANB niet.
      aardbeving: { grootheden: [agr("https://publicaties.vlaanderen.be/view-file/15028", false)] },
    },
  },
  {
    code: "CA",
    naam: mt("normen.landen.CA.naam"),
    stelsel: "eigen",
    normenTekst: mt("normen.landen.CA.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.CA.tekst"),
      url: "https://nrc-publications.canada.ca/eng/view/object/?id=adf1ad94-7ea8-4b08-a19f-653ebb7f45f6",
    },
    normen: {
      belastingen: n("NBC Div. B, Section 4.1", "NRC", "2025", CA_NBC),
      wind: n("NBC Div. B, Subsection 4.1.7", "NRC", "2025", CA_NBC),
      sneeuw: n("NBC Div. B, Subsection 4.1.6", "NRC", "2025", CA_NBC),
      aardbeving: n("NBC Div. B, Subsection 4.1.8", "NRC", "2025", CA_NBC),
      beton: n("CSA A23.3", "CSA", "2024", CA_NBC),
      staal: n("CSA S16", "CSA", "2024", CA_NBC),
      hout: n("CSA O86", "CSA", "2024", CA_NBC),
      metselwerk: n("CSA S304", "CSA", "2024", CA_NBC),
      funderingen: n("NBC Div. B, Section 4.2", "NRC", "2025", CA_NBC),
    },
    locatie: {
      wind: { grootheden: [g("q", "q", mt("normen.landen.CA.q"), "kPa", CA_NBC)], waardenUrl: CA_NBC },
      sneeuw: {
        grootheden: [
          g("S_s", "S_s", mt("normen.landen.CA.Ss"), "kPa", CA_NBC),
          g("S_r", "S_r", mt("normen.landen.CA.Sr"), "kPa", CA_NBC),
        ],
        waardenUrl: CA_NBC,
      },
      aardbeving: {
        grootheden: [
          g("PGA", "PGA", mt("normen.landen.CA.PGA"), "g", CA_NBC),
          g("PGV", "PGV", mt("normen.landen.CA.PGV"), "m/s", CA_NBC),
          g("S_aT", "S_a(T)", mt("normen.landen.CA.SaT"), "g", CA_NBC),
        ],
        waardenUrl: "https://doi.org/10.23687/b1bd3cf0-0672-47f4-8bfa-290ae75fde9b",
      },
    },
  },
  {
    code: "CH",
    naam: mt("normen.landen.CH.naam"),
    stelsel: "eigen",
    normenTekst: mt("normen.landen.CH.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.CH.tekst"),
      url: "https://www.bafu.admin.ch/de/neubauten",
    },
    normen: {
      belastingen: n("SIA 260; SIA 261", "SIA", "2013; 2020", CH_SIA),
      wind: n("SIA 261, chapter 6", "SIA", "2020", CH_SIA),
      sneeuw: n("SIA 261, chapter 5", "SIA", "2020", CH_SIA),
      aardbeving: n("SIA 261, chapter 16", "SIA", "2020", CH_SIA),
      beton: n("SIA 262", "SIA", "2025", CH_SIA),
      staal: n("SIA 263", "SIA", "2013", CH_SIA),
      hout: n("SIA 265", "SIA", "2021", CH_SIA),
      metselwerk: n("SIA 266", "SIA", "2015", CH_SIA),
      funderingen: n("SIA 267", "SIA", "2013", CH_SIA),
    },
    locatie: {
      wind: { grootheden: [g("q_p0", "q_p0", mt("normen.landen.CH.qp0"), "kN/m²", "https://www.bafu.admin.ch/dam/it/sd-web/0yizpSKcDtf1/duktile-erdbebenbemessung-von-holzbauwerken-kurzfassung.pdf")] },
      sneeuw: {
        grootheden: [
          g("h_0", "h_0", mt("normen.landen.CH.h0"), "m", "https://www.schutz-vor-naturgefahren.ch/spezialist/naturgefahren/schnee.html"),
          sk("https://www.schutz-vor-naturgefahren.ch/spezialist/naturgefahren/schnee.html"),
        ],
      },
      aardbeving: {
        grootheden: [
          g("zone", "", mt("normen.landen.CH.zone"), "", "https://www.esti.admin.ch/inhalte/pdf/Weisungen/Deutsch/ESTI_248_1220_d.pdf"),
          g("a_gd", "a_gd", mt("normen.landen.CH.agd"), "m/s²", "https://www.esti.admin.ch/inhalte/pdf/Weisungen/Deutsch/ESTI_248_1220_d.pdf"),
          g("baugrund", "", mt("normen.landen.CH.baugrund"), "", "https://www.esti.admin.ch/inhalte/pdf/Weisungen/Deutsch/ESTI_248_1220_d.pdf"),
        ],
        waardenUrl: "https://data.geo.admin.ch/browser/index.html#/collections/ch.bafu.gefahren-gefaehrdungszonen/items/gefahren-gefaehrdungszonen",
      },
    },
  },
  {
    code: "DE",
    naam: mt("normen.landen.DE.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.DE.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.DE.tekst"),
      url: DIBT,
    },
    normen: {
      belastingen: n("DIN EN 1990/NA; DIN EN 1991-1-1/NA", "DIN", "2010-12; 2010-12 + A1:2015-05", "https://www.dinmedia.de/en/standard/din-en-1990-na-a1/373503452", mt("normen.landen.DE.opmerking")),
      wind: n("DIN EN 1991-1-4/NA", "DIN", "2010-12 (MVV TB); 2024-08 (DIN)", "https://www.dinmedia.de/en/standard/din-en-1991-1-4-na/379080426"),
      sneeuw: n("DIN EN 1991-1-3/NA", "DIN", "2019-04", "https://www.dinmedia.de/en/standard/din-en-1991-1-3-na/301647243"),
      aardbeving: n("DIN 4149 (MVV TB); DIN EN 1998-1/NA", "DIN", "2005-04; 2023-11", "https://www.dinmedia.de/de/norm/din-en-1998-1-na/368322990", mt("normen.landen.DE.tekst2")),
      beton: n("DIN EN 1992-1-1/NA", "DIN", "2013-04 + A1:2015-12", "https://www.dinmedia.de/en/standard/din-en-1992-1-1-na/171217477"),
      staal: n("DIN EN 1993-1-1/NA", "DIN", "2018-12 (MVV TB); 2026-04 (DIN)", "https://www.dinmedia.de/en/standard/din-en-1993-1-1-na/356983440"),
      hout: n("DIN EN 1995-1-1/NA", "DIN", "2013-08", "https://www.dinmedia.de/en/standard/din-en-1995-1-1-na/188145635"),
      metselwerk: n("DIN EN 1996-1-1/NA", "DIN", "2019-12", "https://www.dinmedia.de/en/standard/din-en-1996-1-1-na/315176771"),
      funderingen: n("DIN EN 1997-1/NA", "DIN", "2010-12 (MVV TB)", "https://www.dinmedia.de/en/standard/din-en-1997-1-na/135236447"),
    },
    locatie: {
      wind: {
        grootheden: [
          g("windzone", "", mt("normen.landen.DE.windzone"), "", "https://www.dibt.de/pdf_storage/2025/Z-38.5-337(1.38.5-16!25).pdf"),
          g("q_b0", "q_b,0", mt("normen.landen.DE.qb0"), "kN/m²", "https://www.dibt.de/pdf_storage/2025/Z-38.5-337(1.38.5-16!25).pdf"),
        ],
        waardenUrl: `${DIBT_LIJST}/Windzonen_nach_Verwaltungsgrenzen.xlsx`,
      },
      sneeuw: {
        grootheden: [
          g("schneelastzone", "", mt("normen.landen.DE.schneelastzone"), "", "https://www.dibt.de/pdf_storage/2025/Z-38.5-337(1.38.5-16!25).pdf"),
          sk("https://www.dibt.de/pdf_storage/2025/Z-38.5-337(1.38.5-16!25).pdf"),
        ],
        waardenUrl: `${DIBT_LIJST}/Schneelastzonen_nach_Verwaltungsgrenzen.xlsx`,
      },
      aardbeving: {
        grootheden: [
          g("erdbebenzone", "", mt("normen.landen.DE.erdbebenzone"), "", `${DIBT_LIJST}/MVVTB_2025-1.pdf`),
          g("untergrund", "", mt("normen.landen.DE.untergrund"), "", `${DIBT_LIJST}/MVVTB_2025-1.pdf`),
        ],
        waardenUrl: `${DIBT_LIJST}/Erdbebenzonen_Formular_Untergrundklassen.xlsx`,
      },
    },
  },
  {
    code: "DK",
    naam: mt("normen.landen.DK.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.DK.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.DK.tekst"),
      url: DK_BRON,
    },
    normen: {
      belastingen: n("DS/EN 1990:2007; DS/EN 1991-1-1:2007, DK NA", "Dansk Standard", "2024; 2024", DK_BRON),
      wind: n("DS/EN 1991-1-4:2007 DK NA", "Dansk Standard", "2024", DK_BRON),
      sneeuw: n("DS/EN 1991-1-3:2007 DK NA", "Dansk Standard", "2024", DK_BRON),
      aardbeving: n("DS/EN 1998-1:2005 DK NA", "Dansk Standard", "2020", DK_BRON),
      beton: n("DS/EN 1992-1-1+AC:2008 DK NA", "Dansk Standard", "2024", DK_BRON),
      staal: n("DS/EN 1993-1-1+AC:2007 DK NA", "Dansk Standard", "2019", DK_BRON),
      hout: n("DS/EN 1995-1-1+AC:2007 DK NA", "Dansk Standard", "2024", DK_BRON),
      metselwerk: n("DS/EN 1996-1-1+A1:2013 DK NA", "Dansk Standard", "2019", DK_BRON),
      funderingen: n("DS/EN 1997-1:2007 DK NA", "Dansk Standard", "2021", DK_BRON),
    },
    locatie: {
      wind: {
        grootheden: [vb0("https://bygningsreglementet.dk/media/gwvnysnk/ds-en-199114-dk-na-2024-rev-20231219-final-version20240701-a.pdf")],
        waardenUrl: DK_BRON,
      },
      sneeuw: { grootheden: [sk(DK_BRON)], waardenUrl: DK_BRON },
      aardbeving: { grootheden: [g("a_g", "a_g", mt("normen.landen.DK.ag"), "m/s²", DK_BRON)], waardenUrl: DK_BRON },
    },
  },
  {
    code: "ES",
    naam: mt("normen.landen.ES.naam"),
    // Wettelijk gelden CTE, NCSE-02 en Código Estructural; de Eurocodes met AN zijn toegestaan.
    stelsel: "eigen",
    normenTekst: mt("normen.landen.ES.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.ES.tekst"),
      url: "https://www.boe.es/buscar/doc.php?id=BOE-A-2021-13681",
    },
    normen: {
      belastingen: n("CTE DB SE; CTE DB SE-AE", "MIVAU", null, ES_CTE),
      wind: n("CTE DB SE-AE, annex D", "MIVAU", null, ES_CTE),
      sneeuw: n("CTE DB SE-AE, 3.5", "MIVAU", null, ES_CTE),
      aardbeving: n("NCSE-02", "Ministerio de Fomento", "2002", ES_NCSE),
      beton: n("Código Estructural", "Ministerio de Transportes", "2021", "https://www.boe.es/buscar/doc.php?id=BOE-A-2021-13681"),
      staal: n("Código Estructural; CTE DB SE-A", "Ministerio de Transportes; MIVAU", null, ES_CTE),
      hout: n("CTE DB SE-M", "MIVAU", null, ES_CTE),
      metselwerk: n("CTE DB SE-F", "MIVAU", null, ES_CTE),
      funderingen: n("CTE DB SE-C", "MIVAU", null, ES_CTE),
    },
    locatie: {
      wind: {
        grootheden: [
          g("q_b", "q_b", mt("normen.landen.ES.qb"), "kN/m²", ES_DB),
          g("v_b", "v_b", mt("normen.landen.ES.vb"), "m/s", ES_DB),
        ],
      },
      sneeuw: { grootheden: [sk(ES_DB)] },
      aardbeving: {
        grootheden: [
          g("a_b", "a_b", mt("normen.landen.ES.ab"), "g", ES_NCSE),
          g("K", "K", mt("normen.landen.ES.K"), "", ES_NCSE),
        ],
        waardenUrl: "https://www.ign.es/web/ign/portal/sis-peligrosidad-sismica",
      },
    },
  },
  {
    code: "FI",
    naam: mt("normen.landen.FI.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.FI.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.FI.tekst"),
      url: FI_BRON,
    },
    normen: {
      belastingen: n("SFS-EN 1990 (3/16); SFS-EN 1991-1-1 (4/16)", "Ympäristöministeriö", "2016; 2016", FI_BRON),
      wind: n("SFS-EN 1991-1-4 (7/16)", "Ympäristöministeriö", "2016", FI_BRON),
      sneeuw: n("SFS-EN 1991-1-3 (6/16)", "Ympäristöministeriö", "2016", FI_BRON),
      aardbeving: n("SFS-EN 1998-1", "SFS", null, "https://www.eurocodes.fi/maanjaristysmitoitus/", mt("normen.landen.FI.opmerking")),
      beton: n("SFS-EN 1992-1-1", "Ympäristöministeriö", "2016", FI_BRON),
      staal: n("SFS-EN 1993-1-1", "Ympäristöministeriö", "2019", FI_BRON),
      hout: n("SFS-EN 1995-1-1", "Ympäristöministeriö", "2016", FI_BRON),
      metselwerk: n("SFS-EN 1996-1-1", "Ympäristöministeriö", "2016", FI_BRON),
      funderingen: n("SFS-EN 1997-1 (13/16)", "Ympäristöministeriö", "2016", FI_BRON),
    },
    locatie: {
      wind: { grootheden: [vb0(FI_KUORMAT)], waardenUrl: FI_KUORMAT },
      sneeuw: { grootheden: [sk(FI_KUORMAT)], waardenUrl: FI_KUORMAT },
      aardbeving: {
        grootheden: [],
        geenGrootheid: true,
        opmerking: mt("normen.landen.FI.opmerking2"),
      },
    },
  },
  {
    code: "FR",
    naam: mt("normen.landen.FR.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.FR.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.FR.tekst"),
      url: "https://normalisation.afnor.org/thematiques/eurocodes/",
    },
    normen: {
      belastingen: n("NF EN 1990/NA; NF P06-111-2", "AFNOR", "2011-12; 2004-06 + A1:2009-03", "https://www.boutique.afnor.org/en-gb/standard/nf-en-1990-na/eurocode-basis-of-structural-design-national-annex-to-nf-en-19902003/fa170943/38424"),
      wind: n("NF EN 1991-1-4/NA", "AFNOR", "2008-03 + A1, A2, A3:2019-04", "https://www.boutique.afnor.org/en-gb/standard/nf-en-199114-na-compil-3/fa197764/318216"),
      sneeuw: n("NF EN 1991-1-3/NA", "AFNOR", "2007-05 + A1:2011-07 + A2:2022-07", "https://norminfo.afnor.org/search?commissionID=2467&typeResult=normes-publiees"),
      aardbeving: n("NF EN 1998-1/NA", "AFNOR", "2013-12", "https://norminfo.afnor.org/norme/nf-en-1998-1na/eurocode-8-calcul-des-structures-pour-leur-resistance-aux-seismes-partie-1-regles-generales-actions-sismiques-et-regles/94570"),
      beton: n("NF EN 1992-1-1/NA", "AFNOR", "2016-03 + A1:2026-04", "https://norminfo.afnor.org/search?commissionID=2468&cosID=__param__&typeResult=normes-publiees"),
      staal: n("NF EN 1993-1-1/NA", "AFNOR", "2013", "https://www.boutique.afnor.org/en-gb/standard/nf-en-199311-na/eurocode-3-design-of-steel-structures-national-annex-to-nf-en-1993112005-pa/fa178229/41845"),
      hout: n("NF EN 1995-1-1/NA", "AFNOR", "2010-05", "https://www.boutique.afnor.org/en-gb/standard/nf-en-199511-na/eurocode-5-design-of-timber-structures-part-11-general-common-rules-and-rul/fa163225/35259"),
      metselwerk: n("NF EN 1996-1-1+A1/NA", "AFNOR", "2021-08", "https://www.boutique.afnor.org/en-gb/standard/nf-en-199611-a1-na/eurocode-6-design-of-masonry-structures-part-11-general-rules-for-reinforce/fa201394/263132"),
      funderingen: n("NF EN 1997-1/NA", "AFNOR", "2018-09", "https://www.boutique.afnor.org/en-gb/standard/nf-en-19971-na/eurocode-7-geotechnical-design-part-1-general-rules-national-annex-to-nf-en/fa144141/27943"),
    },
    locatie: {
      wind: { grootheden: [vb0("https://piles.cerema.fr/IMG/pdf/eurocodes_0_et_1_application_aux_ponts_routes_et_passerelles_guide_methodologique_setra_2010_cle7c765c.pdf")] },
      // Alleen uit lesmateriaal van een universiteit.
      sneeuw: { grootheden: [sk("https://celene.univ-orleans.fr/pluginfile.php/534595/mod_resource/content/1/EC1_Neige.pdf", false)] },
      aardbeving: {
        grootheden: [
          g("zone", "", mt("normen.landen.FR.zone"), "", "https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000029492692/2014-09-24"),
          g("a_gr", "a_gr", mt("normen.landen.FR.agr"), "m/s²", "https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000029492692/2014-09-24"),
        ],
        waardenUrl: "https://www.georisques.gouv.fr",
      },
    },
  },
  {
    code: "GB",
    naam: mt("normen.landen.GB.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.GB.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.GB.tekst"),
      url: "https://www.gov.uk/government/publications/structure-approved-document-a",
    },
    normen: {
      belastingen: n("NA to BS EN 1990; NA to BS EN 1991-1-1", "BSI", "2004-12; 2019-07", `${BSI}/uk-national-annex-for-eurocode-basis-of-structural-design`),
      wind: n("NA to BS EN 1991-1-4:2005+A1:2010", "BSI", "2008-09", `${BSI}/uk-national-annex-to-eurocode-1-actions-on-structures-general-actions-wind-actions`),
      sneeuw: n("NA+A2:18 to BS EN 1991-1-3:2003+A1:2015", "BSI", "2018-10", `${BSI}/uk-national-annex-to-eurocode-1-actions-on-structures-general-actions-snow-loads`),
      aardbeving: n("NA to BS EN 1998-1:2004", "BSI", "2008-08", `${BSI}/uk-national-annex-to-eurocode-8-design-of-structures-for-earthquake-resistance-general-rules-seismic-actions-and-rules-for-buildings`),
      beton: n("NA+A2:14 to BS EN 1992-1-1:2004+A1:2014", "BSI", "2014", `${BSI}/uk-national-annex-to-eurocode-2-design-of-concrete-structures-general-rules-and-rules-for-buildings`),
      staal: n("NA+A1:2014 to BS EN 1993-1-1:2005+A1:14", "BSI", "2014", `${BSI}/uk-national-annex-to-eurocode-3-design-of-steel-structures-general-rules-and-rules-for-buildings`),
      hout: n("NA to BS EN 1995-1-1:2004+A2:2014", "BSI", "2019-09", `${BSI}/uk-national-annex-to-eurocode-5-design-of-timber-structures-general-common-rules-and-rules-for-buildings-1`),
      metselwerk: n("NA to BS EN 1996-1-1:2005+A1:2012", "BSI", "2013-04", `${BSI}/uk-national-annex-to-eurocode-6-design-of-masonry-structures-general-rules-for-reinforced-and-unreinforced-masonry-structures`),
      funderingen: n("NA+A2:2022 to BS EN 1997-1:2004+A1:2013", "BSI", "2022-02", `${BSI}/uk-national-annex-to-eurocode-7-geotechnical-design-general-rules-1`),
    },
    locatie: {
      wind: { grootheden: [g("v_bmap", "v_b,map", mt("normen.landen.GB.vbmap"), "m/s", "https://steelconstruction.info/upload/Wiki-Files/e/e7/SCI_P394.pdf")] },
      // De naam is bevestigd, het symbool en de eenheid niet.
      sneeuw: { grootheden: [sk("https://steelconstruction.info/images/6/6a/SCI_P362.pdf", false)] },
      // De kaarten in PD 6698 zijn niet ingezien.
      aardbeving: {
        grootheden: [g("PGA", "PGA", mt("normen.landen.GB.PGA"), "", "https://nora.nerc.ac.uk/id/eprint/508595/1/CR-07-125v3.pdf", false)],
        waardenUrl: "https://www.earthquakes.bgs.ac.uk/hazard/UKhazard2026.html",
      },
    },
  },
  {
    code: "IE",
    naam: mt("normen.landen.IE.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.IE.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.IE.tekst"),
      url: "https://assets.gov.ie/static/documents/technical-guidance-document-a-structure-2012-23-mb.pdf",
    },
    normen: {
      belastingen: n("I.S. EN 1990 NA:2002; I.S. EN 1991-1-1:2002/NA:2013", "NSAI", "2010; 2013", `${IE_SHOP}/i-s-en-1990-national-annex-2002-858018_saig_nsai_nsai_2041130`),
      wind: n("I.S. EN 1991-1-4:2005/NA:2013", "NSAI", "2013", "https://shop.standards.ie/preview/98705226958.pdf?sku=857848_SAIG_NSAI_NSAI_2040731"),
      sneeuw: n("NA+A2:2020 to I.S. EN 1991-1-3:2003&A1:2015", "NSAI", "2020", "https://www.nsai.ie/images/uploads/standards/New_Standards_20201210.pdf"),
      aardbeving: n("I.S. EN 1998-1", "NSAI", "2005", `${IE_SHOP}/i-s-en-1998-1-2005-883908_saig_nsai_nsai_2099732/`, mt("normen.landen.IE.opmerking")),
      beton: n("NA to I.S. EN 1992-1-1:2004+A1:2014", "NSAI", null, IE_TII),
      staal: n("I.S. EN 1993-1-1:2005/NA:2007+A1:2015", "NSAI", "2007 + A1:2015", "https://shop.standards.ie/preview/98702737526.pdf?sku=866887_SAIG_NSAI_NSAI_2061774"),
      hout: n("NA+A1:2013 to I.S. EN 1995-1-1:2004", "NSAI", "2013", IE_TII),
      metselwerk: n("NA+A1:2014 to I.S. EN 1996-1-1:2005", "NSAI", "2010 + A1:2014", `${IE_SHOP}/i-s-en-1996-1-1-2005-856692_saig_nsai_nsai_2037979/`),
      funderingen: n("I.S. EN 1997-1 National Annex", "NSAI", "2015", `${IE_SHOP}/i-s-en-1997-1-national-annex-2015-871865_saig_nsai_nsai_2073061/`),
    },
    locatie: {
      // Alleen uit een artikel in een universitair archief.
      wind: { grootheden: [g("v_bmap", "v_b,map", mt("normen.landen.IE.vbmap"), "m/s", "https://researchrepository.ucd.ie/rest/bitstreams/53141/retrieve", false)] },
      // De naam van de grootheid is in geen Ierse bron gezien.
      sneeuw: { grootheden: [sk("https://www.nsai.ie/about/news/structural-designers-warning/", false)] },
      aardbeving: {
        grootheden: [],
        geenGrootheid: true,
        opmerking: mt("normen.landen.IE.opmerking2"),
      },
    },
  },
  {
    code: "IN",
    naam: mt("normen.landen.IN.naam"),
    stelsel: "eigen",
    normenTekst: mt("normen.landen.IN.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.IN.tekst"),
      url: "https://www.bis.gov.in/others/national-building-code/",
    },
    normen: {
      belastingen: n("IS 875 (Parts 1, 2, 5)", "BIS", "2026; 1987; 1987", bis("MjA4")),
      wind: n("IS 875 (Part 3)", "BIS", "2015", bis("MjA4")),
      sneeuw: n("IS 875 (Part 4)", "BIS", "2021", bis("MjA4")),
      aardbeving: n("IS 1893 (Part 1)", "BIS", null, bis("MjEw"), mt("normen.landen.IN.tekst2")),
      beton: n("IS 456", "BIS", "2000", bis("MTkw")),
      staal: n("IS 800", "BIS", "2007", bis("MTk1")),
      hout: n("IS 883", "BIS", "2016", bis("MTk5")),
      metselwerk: n("IS 1905", "BIS", "1987", bis("MTk5")),
      funderingen: n("IS 1904; IS 6403; IS 2911 series", "BIS", "2021; 1981; several", bis("MjEy")),
    },
    locatie: {
      wind: { grootheden: [g("V_b", "V_b", mt("normen.landen.IN.Vb"), "m/s", "https://www.bmtpc.org/DataFiles/CMS/file/VAI2019/background.pdf")], waardenUrl: "https://www.bmtpc.org/DataFiles/CMS/file/VAI2019/background.pdf" },
      // Het symbool en de eenheid zijn niet officieel bevestigd.
      sneeuw: { grootheden: [g("s_0", "s_0", mt("normen.landen.IN.s0"), "kN/m²", "https://drdo.gov.in/drdo/hi/node/2691", false)] },
      aardbeving: {
        grootheden: [g("Z", "Z", mt("normen.landen.IN.Z"), "", "https://www.iitk.ac.in/nicee/IITGN-WB/EQ03.pdf")],
        waardenUrl: "https://www.bmtpc.org/DataFiles/CMS/file/VAI2019/background.pdf",
      },
    },
  },
  {
    code: "IT",
    naam: mt("normen.landen.IT.naam"),
    // Wettelijk gelden NTC 2018 en de Circolare; de Eurocodes zijn een erkende aanvulling.
    stelsel: "eigen",
    normenTekst: mt("normen.landen.IT.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.IT.tekst"),
      url: IT_NTC,
    },
    normen: {
      belastingen: n("NTC 2018, 3.1", "MIT", "DM 17-01-2018", IT_NTC),
      wind: n("NTC 2018, 3.3", "MIT", "DM 17-01-2018", IT_NTC),
      sneeuw: n("NTC 2018, 3.4", "MIT", "DM 17-01-2018", IT_NTC),
      aardbeving: n("NTC 2018, 3.2 and chapter 7", "MIT", "DM 17-01-2018", IT_NTC),
      beton: n("NTC 2018, 4.1", "MIT", "DM 17-01-2018", IT_NTC),
      staal: n("NTC 2018, 4.2", "MIT", "DM 17-01-2018", IT_NTC),
      hout: n("NTC 2018, 4.4", "MIT", "DM 17-01-2018", IT_NTC),
      metselwerk: n("NTC 2018, 4.5", "MIT", "DM 17-01-2018", IT_NTC),
      funderingen: n("NTC 2018, chapter 6", "MIT", "DM 17-01-2018", IT_NTC),
    },
    locatie: {
      wind: { grootheden: [g("v_b0", "v_b,0", mt("normen.landen.IT.vb0"), "m/s", IT_NTC)] },
      sneeuw: { grootheden: [g("q_sk", "q_sk", mt("normen.landen.IT.qsk"), "kN/m²", IT_NTC)] },
      aardbeving: {
        grootheden: [
          g("a_g", "a_g", mt("normen.landen.IT.ag"), "", IT_NTC),
          g("F_o", "F_o", mt("normen.landen.IT.Fo"), "", IT_NTC),
          g("T_C", "T_C*", mt("normen.landen.IT.TC"), "", IT_NTC),
        ],
        waardenUrl: "https://dati.mit.gov.it/catalog/dataset/parametri-spettrali",
      },
    },
  },
  {
    code: "NO",
    naam: mt("normen.landen.NO.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.NO.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.NO.tekst"),
      url: "https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/10/10-2",
    },
    normen: {
      belastingen: n("NS-EN 1990+NA; NS-EN 1991-1-1+NA", "Standard Norge", "NA:2016; NA:2019", `${NO_BRON}/ns-en-1990-grunnlag-for-prosjektering-av-konstruksjoner/`),
      wind: n("NS-EN 1991-1-4:2005+NA", "Standard Norge", "NA:2009", "https://online.standard.no/ns-en-1991-1-4-2005na-2009"),
      sneeuw: n("NS-EN 1991-1-3:2003+A1:2015+NA", "Standard Norge", "NA:2018", "https://online.standard.no/ns-en-1991-1-3-2003a1-2015na-2018"),
      aardbeving: n("NS-EN 1998-1:2004+A1:2013+NA", "Standard Norge", "NA:2021", `${NO_BRON}/eurokode-8/`),
      beton: n("NS-EN 1992-1-1:2004+A1:2014+NA", "Standard Norge", "NA:2024", "https://online.standard.no/ns-en-1992-1-1-2004a1-2014na-2024"),
      staal: n("NS-EN 1993-1-1:2005+A1:2014+NA", "Standard Norge", "NA:2015", `${NO_BRON}/eurokode-3-prosjektering-av-stalkonstruksjoner/`),
      hout: n("NS-EN 1995-1-1:2004+A2:2014+NA", "Standard Norge", "NA:2024", `${NO_BRON}/eurokode-5/`),
      metselwerk: n("NS-EN 1996-1-1:2005+A1:2012+NA", "Standard Norge", "NA:2025", `${NO_BRON}/eurokode-6/`),
      funderingen: n("NS-EN 1997-1:2004+A1:2013+NA", "Standard Norge", "NA:2025", `${NO_BRON}/eurokode-7/`),
    },
    locatie: {
      // De nationale bijlage is betaald en niet ingezien: symbolen uit secundaire bronnen.
      wind: { grootheden: [vb0(`${NO_BRON}/`, false)] },
      sneeuw: { grootheden: [sk(`${NO_BRON}/snolast/`, false)] },
      aardbeving: { grootheden: [agr("https://gudmundr.folk.ntnu.no/Geodynamics-2023/Presentations%20week%202/Day%204/03_EC8_earthquake_design.pdf", false)] },
    },
  },
  {
    code: "NZ",
    naam: mt("normen.landen.NZ.naam"),
    stelsel: "eigen",
    normenTekst: mt("normen.landen.NZ.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.NZ.tekst"),
      url: NZ_VM1,
    },
    normen: {
      belastingen: n("AS/NZS 1170.0; AS/NZS 1170.1", "Standards NZ", "2002 with amendments", NZ_VM1),
      wind: n("AS/NZS 1170.2", "Standards NZ", "2011 (A1 to A5)", NZ_VM1),
      sneeuw: n("AS/NZS 1170.3", "Standards NZ", "2003 (A1)", NZ_VM1),
      aardbeving: n("NZS 1170.5, as modified by B1/VM1", "Standards NZ", "2004", NZ_VM1),
      beton: n("NZS 3101.1", "Standards NZ", "2006 (A1 to A3)", NZ_HUB),
      staal: n("NZS 3404 (Parts 1, 2)", "Standards NZ", "1997", NZ_HUB),
      hout: n("NZS 3603", "Standards NZ", "1993", NZ_HUB),
      metselwerk: n("NZS 4230", "Standards NZ", "2004", NZ_HUB),
      funderingen: n("B1/VM2", "MBIE", "2nd edition, 2025", "https://www.building.govt.nz/assets/Uploads/building-code-compliance/b-stability/b1-structure/asvm/b1-structure-vm2-second-edition.pdf"),
    },
    locatie: {
      // V_R staat niet in B1/VM1 zelf.
      wind: {
        grootheden: [
          g("regio", "", mt("normen.landen.NZ.regio"), "", "https://www.building.govt.nz/building-code-compliance/b-stability/b1-structure/practice-advisory-9", false),
          g("V_R", "V_R", mt("normen.landen.NZ.VR"), "m/s", "https://www.building.govt.nz/building-code-compliance/b-stability/b1-structure/practice-advisory-9", false),
        ],
      },
      sneeuw: { grootheden: [g("s_g", "s_g", mt("normen.landen.NZ.sg"), "kPa", NZ_VM1)] },
      aardbeving: { grootheden: [g("Z", "Z", mt("normen.landen.NZ.Z"), "", NZ_VM1)] },
    },
  },
  {
    code: "PL",
    naam: mt("normen.landen.PL.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.PL.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.PL.tekst"),
      url: "https://api.sejm.gov.pl/eli/acts/DU/2022/1225/text.html",
    },
    normen: {
      belastingen: n("PN-EN 1990:2004/NA; PN-EN 1991-1-1:2004/NA", "PKN", "2010; 2010", PL_PKN),
      wind: n("PN-EN 1991-1-4:2008/NA", "PKN", "2010", PL_PKN),
      sneeuw: n("PN-EN 1991-1-3:2005/NA", "PKN", "2010", PL_PKN),
      aardbeving: n("PN-EN 1998-1", "PKN", "2005", PL_PKN, mt("normen.landen.PL.opmerking")),
      beton: n("PN-EN 1992-1-1:2008/NA", "PKN", "2018-11", PL_PKN),
      staal: n("PN-EN 1993-1-1:2006/NA", "PKN", "2010", PL_PKN),
      hout: n("PN-EN 1995-1-1:2010/NA", "PKN", "2010", PL_PKN),
      metselwerk: n("PN-EN 1996-1-1:2010/NA", "PKN", "2010", PL_PKN),
      funderingen: n("PN-EN 1997-1:2008/NA", "PKN", "2011", PL_PKN),
    },
    locatie: {
      // Alleen uit lesmateriaal van een universiteit.
      wind: { grootheden: [vb0("https://meil.pw.edu.pl/daas/content/download/61569/322567/file/Wyk%C5%82ad_4_Aero_S_U.pdf", false)] },
      sneeuw: { grootheden: [sk("https://dos.piib.org.pl/wp-content/uploads/2020/03/1353512009_czesc-1-7.pdf")] },
      aardbeving: {
        grootheden: [],
        geenGrootheid: true,
        opmerking: mt("normen.landen.PL.opmerking2"),
      },
    },
  },
  {
    code: "SE",
    naam: mt("normen.landen.SE.naam"),
    stelsel: "eurocode",
    normenTekst: mt("normen.landen.SE.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.SE.tekst"),
      url: SE_BRON,
    },
    normen: {
      belastingen: n("SS-EN 1990:2002; SS-EN 1991-1-1:2002", "SIS", null, SE_BRON),
      wind: n("SS-EN 1991-1-4:2005", "SIS", null, SE_BRON),
      sneeuw: n("SS-EN 1991-1-3:2003", "SIS", null, SE_BRON),
      aardbeving: n("SS-EN 1998-1", "SIS", null, "https://www.sis.se/konstruktionochtillverkning/eurokoder/frgorsvar/ssen1998jordbvningsresistentakonstruktioner/", mt("normen.landen.SE.opmerking")),
      beton: n("SS-EN 1992-1-1:2005", "SIS", null, SE_BRON),
      staal: n("SS-EN 1993-1-1:2005", "SIS", null, SE_BRON),
      hout: n("SS-EN 1995-1-1:2004", "SIS", null, SE_BRON),
      metselwerk: n("SS-EN 1996-1-1:2005", "SIS", null, SE_BRON),
      funderingen: n("SS-EN 1997-1:2005", "SIS", null, SE_BRON),
    },
    locatie: {
      wind: { grootheden: [g("v_b", "v_b", mt("normen.landen.SE.vb"), "m/s", SE_BRON)], waardenUrl: SE_BRON },
      sneeuw: { grootheden: [g("S_0", "S_0", mt("normen.landen.SE.S0"), "kN/m²", SE_BRON)], waardenUrl: SE_BRON },
      aardbeving: {
        grootheden: [],
        opmerking: mt("normen.landen.SE.opmerking2"),
      },
    },
  },
  {
    code: "US",
    naam: mt("normen.landen.US.naam"),
    stelsel: "eigen",
    normenTekst: mt("normen.landen.US.normenTekst"),
    aanwijzing: {
      tekst: mt("normen.landen.US.tekst"),
      url: "https://www.fema.gov/sites/default/files/documents/fema_fy25-bcat-region-7-report.pdf",
    },
    normen: {
      belastingen: n("ASCE/SEI 7, chapter 2 (via IBC 1605)", "ASCE", "7-22 + Supplement 1", "https://www.asce.org/publications-and-news/asce-7"),
      wind: n("ASCE/SEI 7 (via IBC 1609)", "ASCE", "7-22", US_ICC),
      sneeuw: n("ASCE/SEI 7, chapter 7 (via IBC 1608)", "ASCE", "7-22", US_LASTEN),
      aardbeving: n("ASCE/SEI 7 (via IBC 1613)", "ASCE", "7-22", US_VOORBEELD),
      beton: n("ACI 318", "ACI", "318-19", "https://www.concrete.org/store/productdetail.aspx?ItemID=318U19"),
      staal: n("ANSI/AISC 360", "AISC", "360-22", "https://www.aisc.org/modern-steel/news/aisc-releases-new-version-of-specification-for-structural-steel-buildings-ansiaisc-360-22/"),
      hout: n("NDS", "AWC", "2024", US_ICC),
      metselwerk: n("TMS 402/602", "TMS", "2022", "https://masonrysociety.org/product/tms-402-602-22/"),
      funderingen: n("IBC, chapter 18", "ICC", "2024", "https://codes.iccsafe.org/content/IBC2024P1"),
    },
    locatie: {
      wind: { grootheden: [g("V", "V", mt("normen.landen.US.V"), "mph", US_VOORBEELD)] },
      sneeuw: { grootheden: [g("p_g", "p_g", mt("normen.landen.US.pg"), "psf", US_LASTEN)] },
      aardbeving: {
        grootheden: [
          g("S_S", "S_S", mt("normen.landen.US.SS"), "g", US_VOORBEELD),
          g("S_1", "S_1", mt("normen.landen.US.S1"), "g", US_VOORBEELD),
          g("S_DS", "S_DS", mt("normen.landen.US.SDS"), "g", US_VOORBEELD),
          g("S_D1", "S_D1", mt("normen.landen.US.SD1"), "g", US_VOORBEELD),
        ],
        waardenUrl: "https://earthquake.usgs.gov/ws/building-codes/asce7-22",
      },
    },
  },
];
