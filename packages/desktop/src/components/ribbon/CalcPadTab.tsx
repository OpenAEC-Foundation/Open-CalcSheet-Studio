import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import { CALCPAD_LINT, type LintGroep, type LintItem, type MenuSectie, type SyntaxKnop } from "./calcpadLint";
import { b2, glyph } from "./calcIcons";
import { voegIn } from "./invoegen";
import FormuleVenster from "./FormuleVenster";
import { useProjectStore } from "../../store/projectStore";
import { bladOpen, metEditor } from "../../store/codeVerzoek";

const icoon = (k: SyntaxKnop) => (k.icoon ? b2(k.icoon.id, k.icoon.sprite) : glyph(k.glyph));

/**
 * De woorden van het lint in de gekozen taal. calcpadLint.ts bewaart alleen
 * sleutels (calcpad:lint.…); het fragment zelf blijft rekentaal.
 */
function useLintWoorden() {
  const { t } = useTranslation("calcpad");
  const naam = (k: SyntaxKnop) => (k.naam ? t(`lint.knop.${k.naam}`) : k.glyph);
  return {
    naam,
    groep: (label: string) => t(`lint.groep.${label}`),
    menu: (item: Menu) => t(`lint.menu.${item.naam}`),
    kop: (sectie: MenuSectie) => t(`lint.kop.${sectie.kop}`),
    /** Tooltip: het woord en wat er in de editor komt. */
    tip: (k: SyntaxKnop) => `${naam(k)}\n${k.tekst.replace(/[⟨⟩]/g, "").trim()}`,
  };
}

/** React-key van een knop: teken en sleutel samen zijn uniek binnen een stapel of sectie. */
const sleutel = (k: SyntaxKnop) => k.glyph + (k.naam ?? "");

/** Het fragment op de cursor; staat de code niet in beeld, dan eerst de code erbij. */
function invoegen(k: SyntaxKnop) {
  if (k.actie === "afbeelding") return kiesAfbeelding();
  metEditor((view) => voegIn(view, k));
}

/** Boven deze grootte vragen we eerst: het beeld komt in het projectbestand. */
const GROOT_BEELD = 2_000_000;
/** Een tekening boven zoveel elementen of tekens (SVG) vraagt eerst. */
const GROTE_TEKENING = 5_000;
const GROTE_SVG = 1_000_000;

/**
 * Een DXF-tekening als `@svg … @end`-blok (dxfNaarSvg.ts, pas bij gebruik
 * geladen). Een DWG kan de app niet lezen: daarvoor de uitweg via DXF.
 * Geeft null als er niets ingevoegd wordt.
 */
async function tekeningAlsSvg(bestand: File): Promise<string | null> {
  const t = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`calcpad:lint.dxf.${sleutel}`, opties);
  if (/\.dwg$/i.test(bestand.name)) {
    alert(t("dwg"));
    return null;
  }
  const { leesDxf, dxfNaarSvg, DxfFout, MAX_ELEMENTEN } = await import("./dxfNaarSvg");
  try {
    const uit = dxfNaarSvg(leesDxf(new Uint8Array(await bestand.arrayBuffer())));
    const mb = (uit.svg.length / 1_000_000).toFixed(1);
    if ((uit.elementen > GROTE_TEKENING || uit.svg.length > GROTE_SVG)
      && !confirm(t("groot", { aantal: uit.elementen.toLocaleString(i18next.language), mb }))) return null;
    return `@svg\n${uit.svg}\n@end`;
  } catch (fout) {
    if (fout instanceof DxfFout) alert(t(fout.code, { max: MAX_ELEMENTEN.toLocaleString(i18next.language) }));
    else alert(t("mislukt", { fout: (fout as Error)?.message ?? String(fout) }));
    return null;
  }
}

/**
 * Een afbeelding uit een bestand in het blad zetten. Een SVG komt als
 * `@svg … @end`-blok: zichtbaar als tekst, en daarna parametrisch te maken met
 * waarden uit het blad. Een PNG, JPG, GIF of WebP komt als `@img` met de
 * afbeelding zelf erin (data-URL), zodat het project overdraagbaar blijft.
 * Een DXF-tekening wordt omgezet naar zo'n SVG-blok; een DWG geeft een
 * melding met de weg via DXF.
 */
function kiesAfbeelding() {
  const invoer = document.createElement("input");
  invoer.type = "file";
  invoer.accept = ".svg,.png,.jpg,.jpeg,.gif,.webp,.dxf,.dwg,image/svg+xml,image/png,image/jpeg,image/gif,image/webp";
  invoer.onchange = async () => {
    const bestand = invoer.files?.[0];
    if (!bestand) return;
    let tekst: string;
    if (/\.(dxf|dwg)$/i.test(bestand.name)) {
      const blok = await tekeningAlsSvg(bestand);
      if (!blok) return;
      tekst = blok;
    } else if (/\.svg$/i.test(bestand.name) || bestand.type === "image/svg+xml") {
      const svg = (await bestand.text())
        .replace(/<\?xml[^?]*\?>/g, "")
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();
      tekst = `@svg\n${svg}\n@end`;
    } else {
      const mb = (bestand.size / 1_000_000).toFixed(1);
      if (bestand.size > GROOT_BEELD && !confirm(i18next.t("calcpad:lint.grootBeeld", { mb }))) return;
      const data = await new Promise<string>((klaar) => {
        const lezer = new FileReader();
        lezer.onload = () => klaar(String(lezer.result));
        lezer.readAsDataURL(bestand);
      });
      tekst = `@img(${data})`;
    }
    metEditor((view) => voegIn(view, { glyph: "img", tekst, regel: true }));
  };
  invoer.click();
}

/**
 * Het tabblad CalcPAD: de rekentaal als knoppen. Staat altijd in het lint;
 * een klik zet het fragment op de cursor in de editor. Zonder open rekenblad
 * is er geen code om in te schrijven en zijn de knoppen grijs.
 *
 * Past het lint niet in het venster, dan klappen de groepen van rechts af in
 * tot één knop met de hele groep in een uitklappaneel; bij een breder venster
 * klappen ze weer uit.
 */
export default function CalcPadTab() {
  const w = useLintWoorden();
  const { t, i18n } = useTranslation("calcpad");
  const open = useProjectStore(bladOpen);
  const [formules, setFormules] = useState(false);
  const balk = useRef<HTMLDivElement>(null);
  const [ingeklapt, setIngeklapt] = useState(0);

  // Na elke weergave: loopt het lint over de rand, klap dan nog een groep in.
  useLayoutEffect(() => {
    const paneel = balk.current?.closest(".ribbon-content-panel");
    if (!paneel) return;
    if (paneel.scrollWidth > paneel.clientWidth + 1 && ingeklapt < CALCPAD_LINT.length) setIngeklapt((n) => n + 1);
  });

  // Een andere vensterbreedte of taal: alles uit en opnieuw passen.
  useEffect(() => {
    const paneel = balk.current?.closest(".ribbon-content-panel");
    if (!paneel) return;
    let breedte = paneel.clientWidth;
    const waarnemer = new ResizeObserver(() => {
      if (paneel.clientWidth === breedte) return;
      breedte = paneel.clientWidth;
      setIngeklapt(0);
    });
    waarnemer.observe(paneel);
    return () => waarnemer.disconnect();
  }, []);
  useEffect(() => setIngeklapt(0), [i18n.language]);

  const grens = CALCPAD_LINT.length - ingeklapt;
  return (
    <div className="ribbon-content" ref={balk}>
      <div className="ribbon-groups">
        {/* De formulebibliotheek vooraan: mechanica en normformules (formules.ts). */}
        <RibbonGroup label={w.groep("bibliotheek")}>
          <RibbonButton icon={b2("data.table", "standard")} label={t("lint.knop.formules")} title={t("formules.titel")}
            size="large" disabled={!open} onClick={() => setFormules(true)} />
        </RibbonGroup>
        {CALCPAD_LINT.map((groep, i) =>
          i < grens ? (
            <RibbonGroup key={groep.label} label={w.groep(groep.label)}>
              {groep.items.map((item, j) => <Item key={j} item={item} uit={!open} />)}
            </RibbonGroup>
          ) : (
            <IngeklapteGroep key={groep.label} groep={groep} uit={!open} />
          ),
        )}
      </div>
      <FormuleVenster open={formules} onSluit={() => setFormules(false)} />
    </div>
  );
}

/** Het eerste teken van een groep, als icoon op de ingeklapte knop. */
function groepsTeken(groep: LintGroep): string {
  const eerste = groep.items[0];
  return eerste.soort === "menu" ? eerste.glyph : eerste.knoppen[0].glyph;
}

/** Een groep die niet meer past: één grote knop, de groep zelf in een paneel eronder. */
function IngeklapteGroep({ groep, uit }: { groep: LintGroep; uit: boolean }) {
  const w = useLintWoorden();
  const [open, setOpen] = useState(false);
  const anker = useRef<HTMLSpanElement>(null);
  return (
    <RibbonGroup label={w.groep(groep.label)}>
      <span ref={anker} className="calcpad-menu-anker">
        <RibbonButton icon={glyph(groepsTeken(groep))} label={`${w.groep(groep.label)} ▾`} size="large"
          active={open} disabled={uit} onClick={() => setOpen((o) => !o)} />
        {open && anker.current &&
          createPortal(
            <Uitklap anker={anker.current} onSluit={() => setOpen(false)} className="calcpad-groep-paneel">
              <div className="ribbon-group-content">
                {groep.items.map((item, j) => <Item key={j} item={item} uit={uit} />)}
              </div>
            </Uitklap>,
            document.body,
          )}
      </span>
    </RibbonGroup>
  );
}

/**
 * Een paneel onder een lintknop: binnen het venster geplaatst, en dicht bij
 * een klik erbuiten of Escape. Een klik in een ander CalcPAD-paneel (een menu
 * binnen een ingeklapte groep) telt als binnen.
 */
export function Uitklap({ anker, onSluit, className, children }: {
  anker: HTMLElement;
  onSluit: () => void;
  className: string;
  children: ReactNode;
}) {
  const paneel = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    // Het anker zelf heeft geen vak (display: contents); de knop erin wel.
    const r = (anker.querySelector("button") ?? anker).getBoundingClientRect();
    const breed = paneel.current?.offsetWidth ?? 0;
    setPlek({ left: Math.max(4, Math.min(r.left, window.innerWidth - breed - 4)), top: r.bottom + 2 });
  }, [anker]);

  useEffect(() => {
    const buiten = (e: MouseEvent) => {
      const doel = e.target as Element;
      if (paneel.current?.contains(doel) || anker.contains(doel)) return;
      if (doel.closest?.(".calcpad-menu, .calcpad-groep-paneel") && !paneel.current?.classList.contains("calcpad-menu")) return;
      onSluit();
    };
    const toets = (e: KeyboardEvent) => { if (e.key === "Escape") onSluit(); };
    document.addEventListener("mousedown", buiten);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", buiten);
      document.removeEventListener("keydown", toets);
    };
  }, [anker, onSluit]);

  return (
    <div ref={paneel} className={className} role="menu" style={{ left: plek.left, top: plek.top }}>
      {children}
    </div>
  );
}

function Item({ item, uit }: { item: LintItem; uit: boolean }) {
  const w = useLintWoorden();
  if (item.soort === "menu") return <MenuKnop item={item} uit={uit} />;
  return (
    <RibbonButtonStack>
      {item.knoppen.map((k) => (
        <RibbonButton key={sleutel(k)} icon={icoon(k)} label={k.alleenTeken ? "" : w.naam(k)} title={w.tip(k)} size="small" disabled={uit} onClick={() => invoegen(k)} />
      ))}
    </RibbonButtonStack>
  );
}

type Menu = Extract<LintItem, { soort: "menu" }>;

/** Grote knop met een uitklapmenu, zoals de Meer-galerij in de Blueprint. */
function MenuKnop({ item, uit }: { item: Menu; uit: boolean }) {
  const w = useLintWoorden();
  const [open, setOpen] = useState(false);
  const anker = useRef<HTMLSpanElement>(null);

  return (
    <span ref={anker} className="calcpad-menu-anker">
      <RibbonButton
        icon={glyph(item.glyph)}
        label={`${w.menu(item)} ▾`}
        title={item.secties.map(w.kop).join(", ")}
        size="large"
        active={open}
        disabled={uit}
        onClick={() => setOpen((o) => !o)}
      />
      {open && anker.current &&
        createPortal(<MenuPaneel item={item} anker={anker.current} onSluit={() => setOpen(false)} />, document.body)}
    </span>
  );
}

function MenuPaneel({ item, anker, onSluit }: { item: Menu; anker: HTMLElement; onSluit: () => void }) {
  const w = useLintWoorden();
  const kies = (k: SyntaxKnop) => { invoegen(k); onSluit(); };

  return (
    <Uitklap anker={anker} onSluit={onSluit} className="calcpad-menu">
      {item.secties.map((sectie) => (
        <section key={sectie.kop} className="calcpad-menu-sectie">
          <div className="calcpad-menu-kop">{w.kop(sectie)}</div>
          {sectie.raster ? (
            <div className="calcpad-menu-raster">
              {sectie.knoppen.map((k) => (
                <button key={sleutel(k)} type="button" role="menuitem" className="calcpad-menu-teken"
                  title={w.tip(k)} aria-label={w.naam(k)} onMouseDown={(e) => e.preventDefault()} onClick={() => kies(k)}>
                  {k.glyph}
                </button>
              ))}
            </div>
          ) : (
            sectie.knoppen.map((k) => (
              <button key={sleutel(k)} type="button" role="menuitem" className="calcpad-menu-rij"
                title={w.tip(k)} onMouseDown={(e) => e.preventDefault()} onClick={() => kies(k)}>
                <span className="calcpad-menu-glyph">{k.glyph}</span>
                <span className="calcpad-menu-naam">{w.naam(k)}</span>
              </button>
            ))
          )}
        </section>
      ))}
    </Uitklap>
  );
}
