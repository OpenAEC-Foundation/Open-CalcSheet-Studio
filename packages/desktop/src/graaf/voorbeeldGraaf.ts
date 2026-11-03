/**
 * De voorbeeldgraaf van een leeg grafblad: een portaal met kolommen en liggers
 * dat meebeweegt met het aantal velden, de hart-op-hartmaat en de hoogte, met het
 * veldmoment uit een codeblok. Laat in één beeld zien wat er kan.
 */
import { GRAAF_VERSIE, type Graaf, type GraafNode, type GraafVerbinding } from "./model.ts";

export interface VoorbeeldNamen {
  aantalVelden: string;
  hartOpHart: string;
  hoogte: string;
  lijnlast: string;
  moment: string;
  kolomstramien: string;
  aantalKolommen: string;
  kolommen: string;
  liggers: string;
  fundering: string;
}

const CODE_MATEN = "L = n*a\nL_l = (n - 1)*a\nM = q*a^2/8\nB = L + 1 m";

export function voorbeeldGraaf(n: VoorbeeldNamen): Graaf {
  const nodes: GraafNode[] = [
    { id: "n1", soort: "getal", x: 0, y: 0, naam: n.aantalVelden, invoer: { waarde: "4", min: "1", max: "10", stap: "1", eenheid: "" } },
    { id: "n2", soort: "getal", x: 0, y: 190, naam: n.hartOpHart, invoer: { waarde: "3", min: "1", max: "6", stap: "0.5", eenheid: "m" } },
    { id: "n3", soort: "getal", x: 0, y: 380, naam: n.hoogte, invoer: { waarde: "3.5", min: "2", max: "6", stap: "0.1", eenheid: "m" } },
    { id: "n4", soort: "getal", x: 0, y: 570, naam: n.lijnlast, invoer: { waarde: "5", min: "0", max: "20", stap: "0.5", eenheid: "kN/m" } },
    { id: "n5", soort: "codeblok", x: 310, y: 90, invoer: { code: CODE_MATEN } },
    { id: "n6", soort: "reeks", x: 680, y: -20, invoer: { van: "0 m" }, naam: n.kolomstramien },
    { id: "n7", soort: "reeks", x: 680, y: 230, invoer: { van: "0 m" } },
    { id: "n8", soort: "punt", x: 950, y: -20 },
    { id: "n9", soort: "punt", x: 950, y: 220 },
    { id: "n10", soort: "balk", x: 1220, y: 100, naam: n.kolommen, invoer: { b: "200 mm", h: "200 mm" } },
    { id: "n11", soort: "codeblok", x: 620, y: 470, invoer: { code: "x_2 = x + a" } },
    { id: "n12", soort: "punt", x: 950, y: 460 },
    { id: "n13", soort: "punt", x: 950, y: 700 },
    { id: "n14", soort: "balk", x: 1220, y: 480, naam: n.liggers, invoer: { b: "150 mm", h: "300 mm" } },
    { id: "n15", soort: "punt", x: 1220, y: 760, invoer: { x: "-500 mm", y: "-500 mm", z: "-400 mm" } },
    { id: "n16", soort: "doos", x: 1520, y: 760, naam: n.fundering, invoer: { dy: "1000 mm", dz: "400 mm" } },
    { id: "n17", soort: "bekijken", x: 310, y: 480, naam: n.moment },
    { id: "n18", soort: "aantal", x: 1220, y: -120 },
    { id: "n19", soort: "bekijken", x: 1520, y: -120, naam: n.aantalKolommen },
  ];
  const lijn = (vanNode: string, vanPoort: string, naarNode: string, naarPoort: string): GraafVerbinding => ({ vanNode, vanPoort, naarNode, naarPoort });
  const verbindingen = [
    lijn("n1", "waarde", "n5", "n"),
    lijn("n2", "waarde", "n5", "a"),
    lijn("n4", "waarde", "n5", "q"),
    lijn("n5", "L", "n6", "tot"),
    lijn("n2", "waarde", "n6", "stap"),
    lijn("n5", "L_l", "n7", "tot"),
    lijn("n2", "waarde", "n7", "stap"),
    lijn("n6", "lijst", "n8", "x"),
    lijn("n6", "lijst", "n9", "x"),
    lijn("n3", "waarde", "n9", "z"),
    lijn("n8", "punt", "n10", "van"),
    lijn("n9", "punt", "n10", "naar"),
    lijn("n7", "lijst", "n11", "x"),
    lijn("n2", "waarde", "n11", "a"),
    lijn("n7", "lijst", "n12", "x"),
    lijn("n3", "waarde", "n12", "z"),
    lijn("n11", "x_2", "n13", "x"),
    lijn("n3", "waarde", "n13", "z"),
    lijn("n12", "punt", "n14", "van"),
    lijn("n13", "punt", "n14", "naar"),
    lijn("n15", "punt", "n16", "hoek"),
    lijn("n5", "B", "n16", "dx"),
    lijn("n5", "M", "n17", "waarde"),
    lijn("n6", "lijst", "n18", "lijst"),
    lijn("n18", "aantal", "n19", "waarde"),
  ];
  return { versie: GRAAF_VERSIE, nodes, verbindingen };
}
