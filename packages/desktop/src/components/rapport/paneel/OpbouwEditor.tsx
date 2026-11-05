import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  alsGevellaag,
  alsLaag,
  alsOpbouw,
  laaggroepenVoor,
  omschrijving,
  opbouwenVoor,
  somVan,
  voegToe,
  type Bibliotheekopbouw,
  type Bouwdeel,
} from "../../../rapport/gewichten";
import {
  alsGevellaagUitRegel,
  alsLaagUitRegel,
  alsOpbouwUitRegel,
  effectieveP,
  taalVoorRapport,
} from "../../../rapport/gewichtenBibliotheek";
import type { Gevellaag, Laag, Opbouw } from "../../../rapport/model";
import { gevelOpbouw, vlakOpbouw } from "../../../rapport/opbouw";
import { useProjectStore } from "../../../store/projectStore";
import GewichtenVenster from "../gewichten/GewichtenVenster";
import { getalTekst, verplaatst } from "./hulp";
import RijenTabel, { type Kolom } from "./RijenTabel";

/** De twee groepen van 5.5. */
export type Opbouwgroep = "vloerenDaken" | "wanden";

/** Welke bouwdelen uit de bibliotheek bij een groep horen. */
const BOUWDELEN: Record<Opbouwgroep, readonly Bouwdeel[]> = {
  vloerenDaken: ["vloer", "dak"],
  wanden: ["wand"],
};

/** Sleutel van de kop boven de bouwdelen in het bibliotheekmenu. */
const BOUWDEEL_KOP: Record<Bouwdeel, string> = {
  vloer: "belastingen.vloeren",
  dak: "belastingen.daken",
  wand: "belastingen.wanden",
};

function vlakKolommen(t: TFunction<"rapport">): Kolom<Laag>[] {
  return [
    { sleutel: "naam", kop: t("opbouw.laag") },
    { sleutel: "d", kop: "d [m]", breedte: "5.5em", getal: true },
    { sleutel: "rho", kop: "ρ [kN/m³]", breedte: "6.5em", getal: true },
    { sleutel: "p", kop: "p [kN/m²]", breedte: "6.5em", getal: true, placeholder: "d × ρ" },
  ];
}

function gevelKolommen(t: TFunction<"rapport">): Kolom<Gevellaag>[] {
  return [
    { sleutel: "naam", kop: t("opbouw.laag") },
    { sleutel: "p", kop: <>p<sub>rep</sub> [kN/m²]</>, breedte: "7em", getal: true },
    { sleutel: "h", kop: "h [m]", breedte: "5.5em", getal: true },
    { sleutel: "vulling", kop: t("opbouw.vulling"), breedte: "5.5em", getal: true, placeholder: "90%" },
  ];
}

function nieuweOpbouw(soort: Opbouw["soort"]): Opbouw {
  return soort === "vlak"
    ? { soort: "vlak", naam: "", lagen: [{ naam: "", d: "", rho: "", p: "" }] }
    : { soort: "gevel", naam: "", lagen: [{ naam: "", p: "", h: "", vulling: "" }] };
}

/**
 * De opbouwen van één groep uit 5.5 Blijvende belastingen. Een vlakopbouw
 * telt per laag d × ρ op (of de ingevulde p) tot kN/m²; een gevelopbouw telt
 * p × h × vulling op tot kN/m¹. De sommen komen uit opbouw.ts, dezelfde
 * rekensom als in de afdruk.
 *
 * "Uit bibliotheek" voegt een complete opbouw of een losse laag uit
 * rapport/gewichten.ts in; daarna is het gewone invoer die je kunt aanpassen.
 * De namen in die lijst komen zo in het rapport en blijven Nederlands.
 *
 * "Gewichtenbibliotheek" opent het venster met alle regels en hun bron
 * (rapport/gewichtenBibliotheek.ts). Een klik zet een regel in de opbouw, als
 * kopie in getallen: een rapport verandert niet als de bibliotheek verandert.
 */
export default function OpbouwEditor({ groep, titel }: { groep: Opbouwgroep; titel: string }) {
  const { t } = useTranslation("rapport");
  const { t: tg, i18n } = useTranslation("gewichten");
  const opbouwen = useProjectStore((s) => s.rapport.belastingen[groep]);
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const rapportTaal = useProjectStore((s) => taalVoorRapport(s.rapport, i18n.language));
  const [venster, setVenster] = useState(false);

  const wijzig = (fn: (lijst: Opbouw[]) => Opbouw[]) =>
    werkBij((r) => {
      const b = r.belastingen;
      const lijst = fn(b[groep]);
      return {
        ...r,
        belastingen: groep === "wanden" ? { ...b, wanden: lijst } : { ...b, vloerenDaken: lijst },
      };
    });

  const bouwdelen = BOUWDELEN[groep];
  const bibliotheek: Menugroep[] = bouwdelen.map((deel) => ({
    naam: t(BOUWDEEL_KOP[deel]),
    regels: opbouwenVoor([deel]).map((o) => ({
      label: o.naam,
      uittreksel: opbouwTekst(o, t),
      kies: () => wijzig((l) => [...l, alsOpbouw(o)]),
    })),
  }));

  return (
    <div className="rapport-opbouwgroep">
      <h5 className="rapport-subkop">{titel}</h5>
      {opbouwen.length === 0 && <p className="rapport-hint">{t("opbouw.geen")}</p>}
      {opbouwen.map((o, i) => (
        <OpbouwKaart
          key={i}
          opbouw={o}
          pad={`belastingen.${groep}.${i}`}
          index={i}
          aantal={opbouwen.length}
          bouwdelen={bouwdelen}
          wijzig={wijzig}
        />
      ))}
      <div className="rapport-knoppen">
        <button type="button" className="rapport-knop" onClick={() => wijzig((l) => [...l, nieuweOpbouw("vlak")])}>
          + {t("opbouw.vlakopbouw")}
        </button>
        <button type="button" className="rapport-knop" onClick={() => wijzig((l) => [...l, nieuweOpbouw("gevel")])}>
          + {t("opbouw.gevelopbouw")}
        </button>
        <BibliotheekMenu
          knop={t("opbouw.opbouwUitBibliotheek")}
          titel={t("opbouw.opbouwUitBibliotheekTitel")}
          groepen={bibliotheek}
        />
        <button type="button" className="rapport-knop" title={tg("knop.opbouwUitleg")} onClick={() => setVenster(true)}>
          {tg("knop.invoegen")}
        </button>
      </div>
      {venster && (
        <GewichtenVenster
          open
          doel={titel}
          onSluit={() => setVenster(false)}
          onInvoegen={(r) => wijzig((l) => [...l, alsOpbouwUitRegel(r, rapportTaal)])}
        />
      )}
    </div>
  );
}

function OpbouwKaart({ opbouw, pad, index, aantal, bouwdelen, wijzig }: {
  opbouw: Opbouw;
  pad: string;
  index: number;
  aantal: number;
  bouwdelen: readonly Bouwdeel[];
  wijzig: (fn: (lijst: Opbouw[]) => Opbouw[]) => void;
}) {
  const { t } = useTranslation("rapport");
  const { t: tg, i18n } = useTranslation("gewichten");
  const zet = useProjectStore((s) => s.zetRapportVeld);
  const rapportTaal = useProjectStore((s) => taalVoorRapport(s.rapport, i18n.language));
  const [venster, setVenster] = useState(false);
  const vlak = opbouw.soort === "vlak";

  // Een laag uit de bibliotheek achteraan in deze opbouw. De opbouw komt uit
  // de lijst van dát moment; is hij intussen van soort veranderd, dan niets.
  const voegLaagToe = (laag: Laag) =>
    wijzig((l) => l.map((o, j) => (j === index && o.soort === "vlak" ? { ...o, lagen: voegToe(o.lagen, laag) } : o)));
  const voegGevellaagToe = (laag: Gevellaag) =>
    wijzig((l) => l.map((o, j) => (j === index && o.soort === "gevel" ? { ...o, lagen: voegToe(o.lagen, laag) } : o)));

  // Vlak: de losse lagen voor de bouwdelen van deze groep. Gevel: complete
  // wanden als één laag met hun gewicht per m²; h en vulling vul je zelf in.
  const bibliotheek: Menugroep[] = vlak
    ? laaggroepenVoor(bouwdelen).map((g) => ({
        naam: g.naam,
        regels: g.lagen.map((laag) => ({
          label: laag.naam,
          uittreksel: omschrijving(laag),
          kies: () => voegLaagToe(alsLaag(laag)),
        })),
      }))
    : [
        {
          naam: t(BOUWDEEL_KOP.wand),
          regels: opbouwenVoor(["wand"]).map((o) => ({
            label: o.naam,
            uittreksel: opbouwTekst(o, t),
            kies: () => voegGevellaagToe(alsGevellaag(o)),
          })),
        },
      ];
  const menu = (
    <>
      <BibliotheekMenu
        knop={t("opbouw.laagUitBibliotheek")}
        titel={t(vlak ? "opbouw.laagUitBibliotheekTitel" : "opbouw.wandUitBibliotheekTitel")}
        groepen={bibliotheek}
      />
      <button type="button" className="rapport-knop" title={tg("knop.laagUitleg")} onClick={() => setVenster(true)}>
        {tg("knop.invoegen")}
      </button>
    </>
  );

  return (
    <div className="rapport-kaart">
      <div className="rapport-kaart-kop">
        <input
          type="text"
          value={opbouw.naam}
          aria-label={t("opbouw.naamLabel")}
          placeholder={t(vlak ? "opbouw.naamVlak" : "opbouw.naamGevel")}
          onChange={(e) => zet(`${pad}.naam`, e.target.value)}
        />
        <span className="rapport-soort">{t(vlak ? "opbouw.soortVlak" : "opbouw.soortGevel")}</span>
        <button
          type="button"
          className="rapport-icoon"
          title={t("algemeen.omhoog")}
          disabled={index === 0}
          onClick={() => wijzig((l) => verplaatst(l, index, -1))}
        >
          ↑
        </button>
        <button
          type="button"
          className="rapport-icoon"
          title={t("algemeen.omlaag")}
          disabled={index === aantal - 1}
          onClick={() => wijzig((l) => verplaatst(l, index, 1))}
        >
          ↓
        </button>
        <button
          type="button"
          className="rapport-icoon"
          title={t("opbouw.verwijderen")}
          onClick={() => {
            const naam = opbouw.naam.trim() || t("opbouw.zonderNaam");
            if (confirm(t("opbouw.verwijderVraag", { naam }))) {
              wijzig((l) => l.filter((_, j) => j !== index));
            }
          }}
        >
          ✕
        </button>
      </div>
      {opbouw.soort === "vlak" ? (
        <VlakLagen pad={`${pad}.lagen`} lagen={opbouw.lagen} knoppen={menu} />
      ) : (
        <GevelLagen pad={`${pad}.lagen`} lagen={opbouw.lagen} knoppen={menu} />
      )}
      {venster && (
        <GewichtenVenster
          open
          doel={opbouw.naam.trim() || t("opbouw.zonderNaam")}
          onSluit={() => setVenster(false)}
          kanInvoegen={vlak ? undefined : (r) => effectieveP(r) !== undefined}
          onInvoegen={(r) => {
            if (vlak) {
              voegLaagToe(alsLaagUitRegel(r, rapportTaal));
              return;
            }
            const laag = alsGevellaagUitRegel(r, rapportTaal);
            if (laag) voegGevellaagToe(laag);
          }}
        />
      )}
    </div>
  );
}

function VlakLagen({ pad, lagen, knoppen }: { pad: string; lagen: Laag[]; knoppen: ReactNode }) {
  const { t } = useTranslation("rapport");
  const { regels, som } = useMemo(() => vlakOpbouw(lagen), [lagen]);
  return (
    <RijenTabel<Laag>
      pad={pad}
      rijen={lagen}
      kolommen={vlakKolommen(t)}
      nieuweRij={() => ({ naam: "", d: "", rho: "", p: "" })}
      toevoegen={t("opbouw.laagToevoegen")}
      knoppen={knoppen}
      extra={[{ kop: t("opbouw.berekend"), breedte: "6em", waarde: (_rij, i) => getalTekst(regels[i]?.p, 2) }]}
      voet={
        <p className="rapport-som">
          <span>{t("opbouw.totaal")}</span>
          <strong>{getalTekst(som, 2)} kN/m²</strong>
        </p>
      }
    />
  );
}

function GevelLagen({ pad, lagen, knoppen }: { pad: string; lagen: Gevellaag[]; knoppen: ReactNode }) {
  const { t } = useTranslation("rapport");
  const { regels, som } = useMemo(() => gevelOpbouw(lagen), [lagen]);
  return (
    <RijenTabel<Gevellaag>
      pad={pad}
      rijen={lagen}
      kolommen={gevelKolommen(t)}
      nieuweRij={() => ({ naam: "", p: "", h: "", vulling: "" })}
      toevoegen={t("opbouw.laagToevoegen")}
      knoppen={knoppen}
      extra={[{ kop: "q [kN/m¹]", breedte: "6em", waarde: (_rij, i) => getalTekst(regels[i]?.q, 2) }]}
      voet={
        <p className="rapport-som">
          <span>{t("opbouw.totaal")}</span>
          <strong>{getalTekst(som, 2)} kN/m¹</strong>
        </p>
      }
    />
  );
}

/**
 * "6 lagen · 0,43 kN/m²" onder de naam van een opbouw in het menu; bij één
 * laag met een toelichting komt die erachter (die toelichting komt uit de
 * bibliotheek en blijft Nederlands).
 */
function opbouwTekst(o: Bibliotheekopbouw, t: TFunction<"rapport">): string {
  const n = o.lagen.length;
  const toe = n === 1 && o.lagen[0].opmerking ? ` · ${o.lagen[0].opmerking}` : "";
  return `${t("opbouw.aantalLagen", { count: n })} · ${getalTekst(somVan(o), 2)} kN/m²${toe}`;
}

interface Menuregel {
  label: string;
  uittreksel: string;
  kies: () => void;
}

interface Menugroep {
  naam: string;
  regels: Menuregel[];
}

/**
 * Knop met een keuzemenu, in de vorm van "Standaardtekst ▾" in TekstVeld. Een
 * keuze voert de actie uit en sluit het menu; een klik ernaast of Escape
 * sluit het ook.
 */
function BibliotheekMenu({ knop, titel, groepen }: { knop: string; titel: string; groepen: Menugroep[] }) {
  const [open, setOpen] = useState(false);
  const ankerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const klik = (e: MouseEvent) => {
      if (!ankerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", toets);
    };
  }, [open]);

  return (
    <div className="rapport-menu-anker" ref={ankerRef}>
      <button
        type="button"
        className="rapport-knop"
        title={titel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {knop} ▾
      </button>
      {open && (
        <div className="rapport-menu" role="menu">
          {groepen.map((g) => (
            <Fragment key={g.naam}>
              <div className="rapport-menu-groep">{g.naam}</div>
              {g.regels.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  role="menuitem"
                  className="rapport-menu-item"
                  title={`${r.label}: ${r.uittreksel}`}
                  onClick={() => {
                    r.kies();
                    setOpen(false);
                  }}
                >
                  <span className="rapport-menu-label">{r.label}</span>
                  <span className="rapport-menu-uittreksel">{r.uittreksel}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
