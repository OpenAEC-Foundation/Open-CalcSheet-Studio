import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import RibbonGroup from "../ribbon/RibbonGroup";
import RibbonButton from "../ribbon/RibbonButton";
import RibbonButtonStack from "../ribbon/RibbonButtonStack";
import {
  b2,
  cirkelIcon,
  glyph,
  lijnIcon,
  maatlijnIcon,
  pijlIcon,
  polylijnIcon,
  rasterIcon,
  rechthoekIcon,
  redoIcon,
  selecteerIcon,
  snapIcon,
  tekeningBewerkenIcon,
  tekeningInvoegenIcon,
  tekeningNieuwIcon,
  tekeningSluitenIcon,
  tekstIcon,
  undoIcon,
  verwijderIcon,
} from "../ribbon/calcIcons";
import { useProjectStore } from "../../store/projectStore";
import { isTekenBlad } from "../../store/tekenBlad";
import { bladOpen } from "../../store/codeVerzoek";
import { duimVan } from "./code";
import type { Gereedschap } from "./model";
import { GLYPH, OPLEGGING_KEUZES, STAAL_KEUZES, WAND_MATERIALEN, type SymboolId } from "./symbolen";
import { SCHALEN } from "./staalprofielen";
import type { CommandoNaam } from "./commando";
import {
  bewerkTekening,
  kiesGereedschap,
  kiesSymbool,
  nieuweTekening,
  ongedaan,
  opnieuw,
  schrijfInCode,
  sluitTekenen,
  sluitView,
  startCommando,
  toonTekenen,
  useTeken,
  zetRaster,
  zetSchaal,
  zetStijl,
} from "./tekenStore";
import "./Tekenen.css";

const DIKTES = [0.5, 1, 1.5, 2, 3, 4, 6];
const GROOTTES = [10, 11, 12, 14, 16, 18, 24];
const RASTERS = [5, 10, 20, 25, 50];
/** In een view staat het raster in mm in het echt. */
const RASTERS_VIEW = [5, 10, 25, 50, 100, 250, 500, 1000];

const boogIcon = glyph("⌒");
const kopieerIcon = b2("edit.copy", "standard");
const verplaatsIcon = glyph("✥");
const draaiIcon = glyph("↻");
const spiegelIcon = glyph("⇆");
const schaalIcon = glyph("⤢");
const reeksIcon = glyph("⋯");
const objectsnapIcon = glyph("⌖");
const orthoIcon = glyph("∟");
const schemaIcon = glyph("△━△");
const bibliotheekIcon = b2("symbol.library-settings");

/** Een regel in een uitklaplijst van het lint. */
interface MenuRegel {
  sleutel: string;
  glyph: string;
  /** Een klein beeld in plaats van het teken (een profiel). */
  duim?: string;
  naam: string;
  doe: () => void;
}

interface MenuSectie {
  kop: string;
  regels: MenuRegel[];
}

/**
 * Het tabblad Tekenen: een tekening maken of bewerken in een venster over de
 * uitwerking, en die als `@svg`-blok in de code zetten. Maten koppel je in de
 * editor aan het blad; zie tekenen/code.ts. Parametrische symbolen
 * (profielen, schematisering, peilen) staan in tekenen/symbolen.ts.
 */
export default function TekenenTab() {
  const { t } = useTranslation("tekenen");
  const blad = useProjectStore(bladOpen);
  const open = useTeken((s) => s.open);
  const gereedschap = useTeken((s) => s.gereedschap);
  const symbool = useTeken((s) => s.symbool);
  const kanTerug = useTeken((s) => s.terug.length > 0);
  const kanVooruit = useTeken((s) => s.vooruit.length > 0);
  const bestaand = useTeken((s) => s.doel.soort === "blok");
  const inView = useTeken((s) => !!s.vel);
  // Op een tekenblad hoort de tekening bij een view, niet bij de code: geen nieuw blok en niets in te voegen.
  const opTekenblad = useProjectStore((s) => {
    const actief = s.exemplaren.find((e) => e.id === s.activeId);
    return !!actief && isTekenBlad(actief);
  });
  const uit = !blad || !open;

  const knop = (g: Gereedschap, icoon: string, size: "large" | "small") => (
    <RibbonButton
      key={g}
      icon={icoon}
      label={t(`gereedschap.${g}`)}
      title={`${t(`gereedschap.${g}`)}\n${t(`hint.${g}`)}`}
      size={size}
      active={open && gereedschap === g}
      disabled={uit}
      onClick={() => kiesGereedschap(g)}
    />
  );

  const isSym = (sym: SymboolId) => open && gereedschap === "symbool" && symbool.sym === sym;
  const symKnop = (sym: SymboolId, size: "large" | "small", o?: Record<string, string>) => (
    <RibbonButton
      key={sym}
      icon={glyph(GLYPH[sym])}
      label={t(`symbool.${sym}`)}
      title={`${t(`symbool.${sym}`)}\n${t(`symboolTip.${sym}`)}`}
      size={size}
      active={isSym(sym)}
      disabled={uit}
      onClick={() => kiesSymbool(sym, o)}
    />
  );

  const regel = (sym: SymboolId, o?: Record<string, string>, naam = t(`symbool.${sym}`), glyphTeken = GLYPH[sym]): MenuRegel => ({
    sleutel: `${sym}-${JSON.stringify(o ?? {})}`,
    glyph: glyphTeken,
    naam,
    doe: () => kiesSymbool(sym, o),
  });
  const staalSectie: MenuSectie = {
    kop: t("lint.profieltype"),
    regels: STAAL_KEUZES.map((k) => ({ ...regel(k.sym, k.o, t(`familie.${k.id}`), k.glyph), duim: STAAL_DUIMEN[k.id] })),
  };
  const cmdKnop = (naam: CommandoNaam, icoon: string) => (
    <RibbonButton
      key={naam}
      icon={icoon}
      label={t(`cmd.${naam}.naam`)}
      title={`${t(`cmd.${naam}.naam`)}\n${t(`cmd.${naam}.tip`)}`}
      size="small"
      disabled={uit}
      onClick={() => startCommando(naam)}
    />
  );
  const opleggingSectie: MenuSectie = {
    kop: t("symbool.oplegging"),
    regels: OPLEGGING_KEUZES.map((k) => regel(k.sym, k.o, t(`optie.type.${k.id}`), k.glyph)),
  };
  const bibliotheek: MenuSectie[] = [
    { kop: t("lint.profielen"), regels: [...staalSectie.regels, regel("hout")] },
    {
      kop: t("lint.schematisering"),
      regels: [
        regel("ligger"),
        ...opleggingSectie.regels,
        regel("puntlast"),
        regel("qlast"),
        regel("moment"),
        regel("scharnier"),
        regel("veren"),
        regel("windverband"),
        { sleutel: "schema", glyph: "△━△", naam: t("gereedschap.schema"), doe: () => kiesGereedschap("schema") },
      ],
    },
    { kop: t("lint.peilen"), regels: [regel("stramien"), regel("peil"), regel("niveau"), regel("paalpunt")] },
    {
      kop: t("lint.constructie"),
      regels: [regel("kanaalplaat"), regel("kanaalplaatdoorsnede")],
    },
    {
      kop: t("symbool.wand"),
      regels: WAND_MATERIALEN.map((m) => regel("wand", { materiaal: m.id, dikteMm: m.id === "beton" || m.id === "prefab" ? "200" : "100" }, t(`optie.materiaal.${m.id}`))),
    },
  ];

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        {inView ? (
          <RibbonGroup label={t("lint.view")}>
            <RibbonButton icon={tekeningSluitenIcon} label={t("lint.terugNaarVel")} title={t("lint.terugNaarVelTip")} size="large" onClick={sluitView} />
          </RibbonGroup>
        ) : opTekenblad ? (
          <RibbonGroup label={t("lint.view")}>
            <RibbonButton icon={tekeningBewerkenIcon} label={t("lint.inViewTekenen")} title={t("lint.inViewTekenenTip")} size="large" onClick={toonTekenen} />
          </RibbonGroup>
        ) : (
          <RibbonGroup label={t("lint.tekening")}>
            <RibbonButton icon={tekeningNieuwIcon} label={t("lint.nieuw")} title={t("lint.nieuwTip")} size="large" disabled={!blad} onClick={nieuweTekening} />
            <RibbonButton icon={tekeningBewerkenIcon} label={t("lint.bewerken")} title={t("lint.bewerkenTip")} size="large" disabled={!blad} onClick={bewerkTekening} />
          </RibbonGroup>
        )}

        <RibbonGroup label={t("lint.gereedschap")}>
          {knop("selecteer", selecteerIcon, "large")}
          <RibbonButtonStack>
            {knop("lijn", lijnIcon, "small")}
            {knop("pijl", pijlIcon, "small")}
            {knop("polylijn", polylijnIcon, "small")}
          </RibbonButtonStack>
          <RibbonButtonStack>
            {knop("boog", boogIcon, "small")}
            {knop("rechthoek", rechthoekIcon, "small")}
            {knop("cirkel", cirkelIcon, "small")}
          </RibbonButtonStack>
          <RibbonButtonStack>
            {knop("tekst", tekstIcon, "small")}
            {knop("maat", maatlijnIcon, "small")}
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("lint.symbolen")}>
          <MenuKnop
            icon={bibliotheekIcon}
            label={t("lint.bibliotheek")}
            title={t("lint.bibliotheekTip")}
            size="large"
            active={open && (gereedschap === "symbool" || gereedschap === "schema")}
            disabled={uit}
            secties={bibliotheek}
          />
          <RibbonButtonStack>
            <MenuKnop
              icon={glyph(GLYPH.staal)}
              label={t("symbool.staal")}
              title={`${t("symbool.staal")}\n${t("symboolTip.staal")}`}
              size="small"
              active={isSym("staal")}
              disabled={uit}
              secties={[staalSectie]}
            />
            {symKnop("ligger", "small")}
            <MenuKnop
              icon={glyph(GLYPH.oplegging)}
              label={t("symbool.oplegging")}
              title={`${t("symbool.oplegging")}\n${t("symboolTip.oplegging")}`}
              size="small"
              active={isSym("oplegging")}
              disabled={uit}
              secties={[opleggingSectie]}
            />
          </RibbonButtonStack>
          <RibbonButtonStack>
            {symKnop("puntlast", "small")}
            {symKnop("qlast", "small")}
            <RibbonButton
              icon={schemaIcon}
              label={t("lint.schemaKort")}
              title={`${t("gereedschap.schema")}\n${t("hint.schema")}`}
              size="small"
              active={open && gereedschap === "schema"}
              disabled={uit}
              onClick={() => kiesGereedschap("schema")}
            />
          </RibbonButtonStack>
          {inView && (
            <>
              <RibbonButtonStack>
                {symKnop("stramien", "small")}
                {symKnop("niveau", "small")}
                {symKnop("peil", "small")}
              </RibbonButtonStack>
              <RibbonButtonStack>
                <MenuKnop
                  icon={glyph(GLYPH.wand)}
                  label={t("symbool.wand")}
                  title={`${t("symbool.wand")}\n${t("symboolTip.wand")}`}
                  size="small"
                  active={isSym("wand")}
                  disabled={uit}
                  secties={bibliotheek.slice(-1)}
                />
                {symKnop("kanaalplaat", "small")}
                {symKnop("kanaalplaatdoorsnede", "small")}
              </RibbonButtonStack>
            </>
          )}
        </RibbonGroup>

        <RibbonGroup label={t("lint.opmaak")}>
          <StijlVelden uit={uit} />
        </RibbonGroup>

        <RibbonGroup label={t("lint.raster")}>
          <RasterVelden uit={uit} />
        </RibbonGroup>

        <RibbonGroup label={t("lint.bewerkenGroep")}>
          <RibbonButtonStack>
            <RibbonButton icon={undoIcon} label={t("lint.ongedaan")} size="small" disabled={uit || !kanTerug} onClick={ongedaan} />
            <RibbonButton icon={redoIcon} label={t("lint.opnieuw")} size="small" disabled={uit || !kanVooruit} onClick={opnieuw} />
            {cmdKnop("erase", verwijderIcon)}
          </RibbonButtonStack>
          <RibbonButtonStack>
            {cmdKnop("move", verplaatsIcon)}
            {cmdKnop("copy", kopieerIcon)}
            {cmdKnop("rotate", draaiIcon)}
          </RibbonButtonStack>
          <RibbonButtonStack>
            {cmdKnop("mirror", spiegelIcon)}
            {cmdKnop("scale", schaalIcon)}
            {cmdKnop("array", reeksIcon)}
          </RibbonButtonStack>
        </RibbonGroup>

        {/* Een view staat al in het project: daar is niets in te voegen of te sluiten. */}
        {!inView && !opTekenblad && (
          <RibbonGroup label={t("lint.uitvoer")}>
            <RibbonButton
              icon={tekeningInvoegenIcon}
              label={t(bestaand ? "lint.bijwerken" : "lint.invoegen")}
              title={t(bestaand ? "lint.bijwerkenTip" : "lint.invoegenTip")}
              size="large"
              disabled={uit}
              onClick={schrijfInCode}
            />
            <RibbonButton icon={tekeningSluitenIcon} label={t("lint.sluiten")} title={t("lint.sluitenTip")} size="large" disabled={uit} onClick={sluitTekenen} />
          </RibbonGroup>
        )}
      </div>
    </div>
  );
}

/** Een klein voorbeeld per profieltype, voor de uitklaplijst. */
const STAAL_DUIMEN: Record<string, string> = Object.fromEntries(
  STAAL_KEUZES.map((k) => [k.id, duimVan("staal", k.o ?? {})]),
);

/**
 * Een lintknop met een uitklaplijst, in de stijl van de galerijen op het
 * tabblad CalcPAD: kies het soort (HEB, koker …) en het gereedschap plaatst het.
 */
function MenuKnop({
  icon,
  label,
  title,
  size,
  active,
  disabled,
  secties,
}: {
  icon: string;
  label: string;
  title: string;
  size: "large" | "small";
  active: boolean;
  disabled: boolean;
  secties: MenuSectie[];
}) {
  const knop = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!plek) return;
    const weg = (e: PointerEvent) => {
      const doel = e.target as Node;
      if (!menu.current?.contains(doel) && !knop.current?.contains(doel)) setPlek(null);
    };
    const toets = (e: KeyboardEvent) => e.key === "Escape" && setPlek(null);
    document.addEventListener("pointerdown", weg, true);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("pointerdown", weg, true);
      document.removeEventListener("keydown", toets);
    };
  }, [plek]);

  // Past het menu niet rechts van de knop, dan schuift het naar links tot het in het venster past.
  useLayoutEffect(() => {
    const breed = menu.current?.offsetWidth ?? 0;
    if (!plek || breed === 0) return;
    const links = Math.max(4, Math.min(plek.left, window.innerWidth - breed - 4));
    if (links !== plek.left) setPlek({ ...plek, left: links });
  }, [plek]);

  const wissel = () => {
    if (plek) return setPlek(null);
    const r = knop.current?.getBoundingClientRect();
    if (r) setPlek({ left: r.left, top: r.bottom + 2 });
  };

  return (
    <>
      <button
        ref={knop}
        className={`ribbon-btn${size === "small" ? " small" : ""}${active ? " active" : ""} tk-menuknop`}
        title={title}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={!!plek}
        onClick={wissel}
      >
        <div className="ribbon-btn-icon" dangerouslySetInnerHTML={{ __html: icon }} />
        <span className="ribbon-btn-label">{label} ▾</span>
      </button>
      {plek &&
        createPortal(
          <div ref={menu} className="calcpad-menu tk-menu" style={plek} role="menu">
            {secties.map((sectie) => (
              <section key={sectie.kop} className="calcpad-menu-sectie">
                <div className="calcpad-menu-kop">{sectie.kop}</div>
                {sectie.regels.map((r) => (
                  <button
                    key={r.sleutel}
                    type="button"
                    role="menuitem"
                    className="calcpad-menu-rij"
                    onClick={() => {
                      r.doe();
                      setPlek(null);
                    }}
                  >
                    {r.duim ? (
                      <span className="calcpad-menu-glyph tk-menu-duim" dangerouslySetInnerHTML={{ __html: r.duim }} />
                    ) : (
                      <span className="calcpad-menu-glyph">{r.glyph}</span>
                    )}
                    <span className="calcpad-menu-naam">{r.naam}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/** De tekenschaal voor profielen en hout: 1 : n op papier. */
function SchaalVeld({ uit }: { uit: boolean }) {
  const { t } = useTranslation("tekenen");
  const schaal = useTeken((s) => s.schaal);
  return (
    <label className={`tk-lint-rij${uit ? " uit" : ""}`} title={t("lint.schaalTip")}>
      <span>{t("lint.schaal")}</span>
      <select value={schaal} disabled={uit} onChange={(e) => zetSchaal(Number(e.target.value))}>
        {SCHALEN.map((n) => <option key={n} value={n}>1:{n}</option>)}
      </select>
    </label>
  );
}

/** Lijnkleur, dikte en vulling voor nieuwe vormen; een geselecteerde vorm neemt ze over. */
function StijlVelden({ uit }: { uit: boolean }) {
  const { t } = useTranslation("tekenen");
  const stijl = useTeken((s) => s.stijl);
  const opTekenblad = useProjectStore((s) => {
    const actief = s.exemplaren.find((e) => e.id === s.activeId);
    return !!actief && isTekenBlad(actief);
  });
  return (
    <>
      <div className="tk-lint-stapel">
        <label className={`tk-lint-rij${uit ? " uit" : ""}`} title={t("lint.lijnkleurTip")}>
          <span>{t("lint.lijnkleur")}</span>
          <input type="color" value={stijl.lijn} disabled={uit} onChange={(e) => zetStijl({ lijn: e.target.value.toUpperCase() })} />
        </label>
        <label className={`tk-lint-rij${uit ? " uit" : ""}`} title={t("lint.dikteTip")}>
          <span>{t("lint.dikte")}</span>
          <select value={stijl.dikte} disabled={uit} onChange={(e) => zetStijl({ dikte: Number(e.target.value) })}>
            {DIKTES.map((d) => <option key={d} value={d}>{d} px</option>)}
          </select>
        </label>
        <label className={`tk-lint-rij${uit ? " uit" : ""}`} title={t("lint.vullingTip")}>
          <input type="checkbox" checked={!!stijl.vulling} disabled={uit}
            onChange={(e) => zetStijl({ vulling: e.target.checked ? "#E5E7EB" : null })} />
          <span>{t("lint.vulling")}</span>
          <input type="color" value={stijl.vulling ?? "#E5E7EB"} disabled={uit || !stijl.vulling}
            onChange={(e) => zetStijl({ vulling: e.target.value.toUpperCase() })} />
        </label>
      </div>
      <div className="tk-lint-stapel">
        <label className={`tk-lint-rij${uit ? " uit" : ""}`} title={t("lint.streepTip")}>
          <input type="checkbox" checked={stijl.streep} disabled={uit} onChange={(e) => zetStijl({ streep: e.target.checked })} />
          <span>{t("lint.streep")}</span>
        </label>
        <label className={`tk-lint-rij${uit ? " uit" : ""}`} title={t("lint.grootteTip")}>
          <span>{t("lint.grootte")}</span>
          <select value={stijl.grootte} disabled={uit} onChange={(e) => zetStijl({ grootte: Number(e.target.value) })}>
            {GROOTTES.map((g) => <option key={g} value={g}>{g} px</option>)}
          </select>
        </label>
        {!opTekenblad && <SchaalVeld uit={uit} />}
      </div>
    </>
  );
}

function RasterVelden({ uit }: { uit: boolean }) {
  const { t } = useTranslation("tekenen");
  const raster = useTeken((s) => s.raster);
  const inView = useTeken((s) => !!s.vel);
  const lijst = inView ? RASTERS_VIEW : RASTERS;
  return (
    <>
      <RibbonButtonStack>
        <RibbonButton icon={rasterIcon} label={t("lint.rasterTonen")} size="small" active={raster.toon} disabled={uit}
          onClick={() => zetRaster({ toon: !raster.toon })} />
        <RibbonButton icon={snapIcon} label={t("lint.snappen")} title={t("lint.snappenTip")} size="small" active={raster.snap} disabled={uit}
          onClick={() => zetRaster({ snap: !raster.snap })} />
        <label className={`tk-lint-rij${uit ? " uit" : ""}`} title={t("lint.rastermaatTip")}>
          <span>{t("lint.rastermaat")}</span>
          <select value={raster.maat} disabled={uit} onChange={(e) => zetRaster({ maat: Number(e.target.value) })}>
            {!lijst.includes(raster.maat) && <option value={raster.maat}>{raster.maat} {inView ? "mm" : "px"}</option>}
            {lijst.map((r) => <option key={r} value={r}>{r} {inView ? "mm" : "px"}</option>)}
          </select>
        </label>
      </RibbonButtonStack>
      <RibbonButtonStack>
        <RibbonButton icon={objectsnapIcon} label={t("lint.objectsnap")} title={t("lint.objectsnapTip")} size="small" active={raster.object} disabled={uit}
          onClick={() => zetRaster({ object: !raster.object })} />
        <RibbonButton icon={orthoIcon} label={t("lint.ortho")} title={t("lint.orthoTip")} size="small" active={raster.ortho} disabled={uit}
          onClick={() => zetRaster({ ortho: !raster.ortho })} />
      </RibbonButtonStack>
    </>
  );
}
