import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrintStore } from "../../store/printStore";
import { useProjectStore } from "../../store/projectStore";
import { useUitdraai, UitdraaiInhoud, loopkopLinks } from "./PrintDocument";
import RapportAfdruk from "../rapport/afdruk/RapportAfdruk";
import { useRapportBureau } from "../rapport/afdruk/useRapportWeergave";
import { meetBlokken, verdeelPerSectie, pxPerMm, MATEN, SPELING, type Maten } from "./paginering";
import { usePdfVersie } from "./pdfBlad";
import { useDrieDVersie } from "./drieDBlok";
import { useIfcxVersie } from "./ifcxBlok";
import { useIframeVersie, vulIframesIn } from "./iframeBlok";
import { useJsVersie, vulJsIn } from "./jsBlok";
import "./PrintDocument.css";
import "./AfdrukVoorbeeld.css";

const ZOOMSTANDEN = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3];

/**
 * De voet van een vel van het rapport: de voetafbeelding van het bureau over
 * de volle breedte in de ondermarge (of zonder afbeelding een dunne lijn met
 * de bureaunaam), en rechts het paginanummer midden in die marge. Dezelfde
 * plaats als in de echte afdruk, waar de voet een vast element is en het
 * nummer in de paginamarge staat (RapportAfdruk.css).
 */
function rapportVoet(nummer: number, voetafbeelding: string, bureaunaam: string, maten: Maten): HTMLElement[] {
  const uit: HTMLElement[] = [];
  if (voetafbeelding) {
    const beeld = document.createElement("img");
    beeld.className = "av-rapport-voet";
    beeld.alt = "";
    beeld.src = voetafbeelding;
    beeld.style.height = `${maten.marge.onder}mm`;
    uit.push(beeld);
  } else {
    const lijn = document.createElement("div");
    lijn.className = "av-rapport-lijn";
    lijn.textContent = bureaunaam;
    lijn.style.left = `${maten.marge.links}mm`;
    lijn.style.right = `${maten.marge.rechts}mm`;
    uit.push(lijn);
  }
  const nr = document.createElement("div");
  nr.className = "av-rapport-nummer";
  nr.textContent = String(nummer);
  nr.style.right = `${maten.marge.rechts}mm`;
  nr.style.height = `${maten.marge.onder}mm`;
  uit.push(nr);
  return uit;
}

/**
 * Afdrukvoorbeeld als paneel in de applicatie.
 *
 * De uitdraai wordt eerst op ware bladbreedte opgebouwd in een meetopstelling
 * buiten beeld. Daarna wordt hij opgemeten en in vellen verdeeld, en komen er
 * kopieën van de regels op losse A4-pagina's te staan. Kopieën, geen
 * verplaatsingen: de meetopstelling blijft van React, en die zou omvallen als
 * er nodes onder vandaan worden gehaald.
 *
 * Waarom niet gewoon de doorlopende uitdraai tonen: dan zie je niet waar het
 * papier ophoudt, en dat is juist wat je vooraf wilt weten.
 *
 * Twee soorten uitdraai: de losse bladen (loopkop en loopvoet) en het
 * constructierapport (de voet van het bureau en een paginanummer, geen
 * loopkop). Het verdelen is voor beide hetzelfde; de maten en de omlijsting
 * van een vel verschillen.
 *
 * De balk erboven, het nummer onder elk vel en wat óp het vel staat, volgen allemaal
 * de taal van de app.
 */
export default function AfdrukVoorbeeld() {
  const { t } = useTranslation("beelden");
  const uitdraai = useUitdraai();
  const { bladen, alleBladen, onderdeel, datum } = uitdraai;
  const soort = usePrintStore((s) => s.soort);
  const sluitVoorbeeld = usePrintStore((s) => s.sluitVoorbeeld);
  const afdrukken = usePrintStore((s) => s.afdrukken);
  const selectie = usePrintStore((s) => s.selectie);
  const kiesSelectie = usePrintStore((s) => s.kiesSelectie);
  // De keuzelijst kent twee soorten: het hele project, of één blad.
  const bereik = selectie && selectie.length === 1 ? selectie[0] : "project";

  const rapport = soort === "rapport";
  const maten: Maten = MATEN[soort];
  // Het bureau voor de voet van de rapportvellen. Het rapport, de gegevens en
  // de bladen zelf staan erbij om opnieuw te verdelen als het rapport
  // verandert zonder dat zijn hoogte dat doet (een tekst, een kleur).
  const bureau = useRapportBureau();
  const rapportGegevens = useProjectStore((s) => s.rapport);
  const gegevens = useProjectStore((s) => s.gegevens);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const voetafbeelding = bureau.voetafbeelding;
  const bureaunaam = bureau.naam;
  // Een getekende PDF-pagina verandert de hoogte niet (de maat staat vooraf
  // vast), maar moet wel op de vellen komen: dan opnieuw verdelen.
  const pdfVersie = usePdfVersie();
  // Idem voor een 3D-blok: zijn afbeelding komt in de plaats van de projectie
  // (drieDBlok.ts), vaak zonder dat de hoogte verandert.
  const drieDVersie = useDrieDVersie();
  const ifcxVersie = useIfcxVersie();
  // Een bevestigde externe pagina komt op de vellen (iframeBlok.ts).
  const iframeVersie = useIframeVersie();
  // En een uitgevoerd `@js`-blok: zijn afbeelding of zijn venster (jsBlok.ts).
  const jsVersie = useJsVersie();
  const scriptsWeg = useRef<(() => void) | null>(null);
  const iframesWeg = useRef<(() => void) | null>(null);

  const meetRef = useRef<HTMLDivElement>(null);
  const vellenRef = useRef<HTMLDivElement>(null);
  const schuifRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.75);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // Het punt onder de muis bij Ctrl+scrollen, om na het zoomen terug te zetten.
  const anker = useRef<{ cx: number; cy: number; x: number; y: number; van: number } | null>(null);
  const [aantal, setAantal] = useState(0);
  const [bezig, setBezig] = useState(true);

  // Kopregels per vel: dezelfde als de loopkop van de echte afdruk.
  const linksBoven = loopkopLinks(uitdraai);

  const bouwPaginas = useCallback(() => {
    const bron = meetRef.current;
    const host = vellenRef.current;
    if (!bron || !host) return;
    // Tijdens het printen verdwijnt de hoofdweergave, en daarmee dit paneel.
    // Meten levert dan overal nul op en de hele uitdraai zou op één pagina
    // belanden. Niets doen is beter: zodra het paneel terug is meet de
    // ResizeObserver opnieuw.
    if (bron.offsetHeight === 0) return;

    const mm = pxPerMm();
    // Elke sectie begint op een vers vel en wordt apart verdeeld, met een
    // eigen bladhoogte: een rekenblad (ook in bijlage A) rekent met de
    // speling, het rapport zelf staat op een vast raster en mag het vel tot en
    // met de laatste regel vullen, net als de referentie.
    const paginas = verdeelPerSectie(meetBlokken(bron), (sectie) =>
      (/\bprint-blad\b/.test(sectie) ? maten.inhoud.hoogte - SPELING : maten.inhoud.vulhoogte) * mm,
    );
    // De huisstijl van het rapport staat als CSS-variabelen op de wortel in de
    // meetopstelling. Een vel staat los van die wortel, dus krijgt hij ze mee.
    const huisstijl = rapport ? bron.querySelector<HTMLElement>(".rpa-wortel")?.style.cssText ?? "" : "";

    iframesWeg.current?.();
    scriptsWeg.current?.();
    host.replaceChildren();
    paginas.forEach((pagina, i) => {
      const vel = document.createElement("div");
      vel.className = rapport ? "av-pagina print-opmaak rpa-wortel" : "av-pagina print-opmaak";
      if (huisstijl) vel.style.cssText = huisstijl;

      // De sectieklasse mee: de opmaakregels hangen eraan, en zonder die ouder
      // valt een losgeknipte regel terug op de schermopmaak.
      const inhoud = document.createElement("div");
      inhoud.className = `av-pagina-inhoud ${pagina[0]?.sectie ?? ""}`.trim();
      inhoud.style.top = `${maten.marge.boven}mm`;
      inhoud.style.left = `${maten.marge.links}mm`;
      inhoud.style.width = `${maten.inhoud.breedte}mm`;
      inhoud.style.height = `${maten.inhoud.hoogte}mm`;
      // Idem voor de wikkels waar de regels uit komen: de kern schrijft zijn
      // lettertype en regelafstand op `.ifc-calc`. Regels met dezelfde wikkels
      // gaan samen in één opgebouwde keten, zodat het er niet alleen goed
      // uitziet maar ook precies zo hoog blijft als bij het meten.
      let doel = inhoud;
      let vorigeWikkels = "";
      let eersteVanDezePagina = true;
      for (const blok of pagina) {
        const sleutel = blok.wikkels.join(" > ");
        if (sleutel !== vorigeWikkels) {
          doel = inhoud;
          for (const klasse of blok.wikkels) {
            const wikkel = document.createElement("div");
            wikkel.className = klasse;
            doel.appendChild(wikkel);
            doel = wikkel;
          }
          vorigeWikkels = sleutel;
        }
        const kloon = blok.el.cloneNode(true) as HTMLElement;
        // De bovenmarge van het eerste blok vervalt op een pagina-overgang. In
        // de doorlopende meting klapt die marge samen met die van het blok
        // erboven; bovenaan een vers vel is er niets om mee samen te klappen en
        // komt hij er als extra ruimte bij — genoeg om de onderste regel van
        // het vel af te duwen.
        if (eersteVanDezePagina) {
          kloon.style.marginTop = "0";
          eersteVanDezePagina = false;
        }
        doel.appendChild(kloon);
      }

      if (rapport) {
        // Geen loopkop: het rapport heeft alleen een voet.
        vel.append(inhoud, ...rapportVoet(i + 1, voetafbeelding, bureaunaam, maten));
      } else {
        const kop = document.createElement("div");
        kop.className = "av-loopkop";
        kop.innerHTML = "<span></span><span></span>";
        (kop.firstChild as HTMLElement).textContent = linksBoven;
        (kop.lastChild as HTMLElement).textContent = onderdeel ?? "";

        const voet = document.createElement("div");
        voet.className = "av-loopvoet";
        voet.innerHTML = "<span></span><span></span><span></span>";
        (voet.children[0] as HTMLElement).textContent = "Open CalcSheet Studio";
        (voet.children[1] as HTMLElement).textContent = t("afdruk.paginaVan", { nummer: i + 1, totaal: paginas.length });
        (voet.children[2] as HTMLElement).textContent = datum;

        vel.append(kop, inhoud, voet);
      }

      // Het nummer buiten het vel: het papier klemt af wat er niet op past, en
      // een bijschrift binnen die rand zou daar in meegaan.
      const nummer = document.createElement("div");
      nummer.className = "av-nummer";
      nummer.textContent = t("afdruk.paginaVan", { nummer: i + 1, totaal: paginas.length });

      const omhulsel = document.createElement("div");
      omhulsel.className = "av-vel";
      omhulsel.append(vel, nummer);
      host.appendChild(omhulsel);
    });
    // Op de vellen en niet in de meetopstelling: de hoogte staat vast, en een
    // iframe in de meetopstelling zou elke pagina dubbel laden.
    iframesWeg.current = vulIframesIn(host);
    scriptsWeg.current = vulJsIn(host);

    setAantal(paginas.length);
    setBezig(false);
  }, [linksBoven, onderdeel, datum, rapport, maten, voetafbeelding, bureaunaam, t]);

  /*
   * Opnieuw verdelen zodra de opmaak verandert.
   *
   * De parametrische beelden meten hun eigen tekengebied en schalen zich pas
   * daarna; meteen verdelen zou op hoogtes gebeuren die een tel later niet meer
   * kloppen. Een ResizeObserver op de meetopstelling vangt elke wijziging op,
   * en een korte vertraging bundelt een reeks wijzigingen tot één verdeling.
   * Wat de hoogte niet verandert (een woord, een kleur) komt via de
   * afhankelijkheden binnen.
   *
   * Bewust geen requestAnimationFrame: dat staat volledig stil zodra het
   * venster niet zichtbaar is. Het voorbeeld zou dan blijven hangen op
   * "pagina's opmaken" tot de gebruiker terugkomt.
   */
  useEffect(() => {
    const bron = meetRef.current;
    if (!bron) return;
    setBezig(true);

    let timer = 0;
    const plan = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(bouwPaginas, 120);
    };

    const ro = new ResizeObserver(plan);
    ro.observe(bron);
    plan();

    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [bouwPaginas, bladen, rapportGegevens, gegevens, exemplaren, bureau, pdfVersie, drieDVersie, ifcxVersie, iframeVersie, jsVersie]);

  useEffect(() => () => {
    iframesWeg.current?.();
    scriptsWeg.current?.();
  }, []);

  /*
   * Ctrl+scrollen zoomt door de zoomstanden, rond het punt onder de muis.
   * Niet via onWheel: React luistert passief, en dan houdt preventDefault het
   * gewone scrollen niet tegen. Een muiswiel geeft ±100 per tik, knijpen op
   * een touchpad veel kleine stapjes met ctrlKey; die tellen op tot een stand.
   */
  useEffect(() => {
    const el = schuifRef.current;
    if (!el) return;
    let opgeteld = 0;
    const wiel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (Math.sign(e.deltaY) !== Math.sign(opgeteld)) opgeteld = 0;
      opgeteld += e.deltaY;
      if (Math.abs(opgeteld) < 50) return;
      const inzoomen = opgeteld < 0;
      opgeteld = 0;
      const huidig = zoomRef.current;
      const nieuw = inzoomen
        ? ZOOMSTANDEN.find((z) => z > huidig + 1e-6)
        : [...ZOOMSTANDEN].reverse().find((z) => z < huidig - 1e-6);
      if (nieuw === undefined) return;
      const r = el.getBoundingClientRect();
      anker.current = { cx: e.clientX - r.left, cy: e.clientY - r.top, x: el.scrollLeft, y: el.scrollTop, van: huidig };
      setZoom(nieuw);
    };
    el.addEventListener("wheel", wiel, { passive: false });
    return () => el.removeEventListener("wheel", wiel);
  }, []);

  // Na een zoomstap het punt onder de muis op zijn plek houden. De vellen
  // schalen vanaf de bovenrand van de inhoud, onder de bovenpadding.
  useLayoutEffect(() => {
    const el = schuifRef.current;
    const a = anker.current;
    if (!el || !a) return;
    anker.current = null;
    const f = zoom / a.van;
    const boven = parseFloat(getComputedStyle(el).paddingTop) || 0;
    el.scrollLeft = (a.x + a.cx) * f - a.cx;
    el.scrollTop = (a.y + a.cy - boven) * f + boven - a.cy;
  }, [zoom]);

  return (
    <div className="av-paneel">
      <div className="av-balk">
        <span className="av-titel">{rapport ? t("afdruk.titelRapport") : t("afdruk.titel")}</span>
        <span className="av-tel">
          {bezig ? t("afdruk.opmaken") : t("afdruk.paginas", { count: aantal })}
        </span>
        {/* Het rapport kent geen bereik: het bevat altijd alle bladen. */}
        {!rapport && (
          <span className="av-bereik">
            <label htmlFor="av-bereik">{t("afdruk.bereik")}</label>
            <select
              id="av-bereik"
              value={bereik}
              onChange={(e) => kiesSelectie(e.target.value === "project" ? null : [e.target.value])}
            >
              <option value="project">{t("afdruk.heleProject", { count: alleBladen.length })}</option>
              {alleBladen.map((ex) => (
                <option key={ex.id} value={ex.id}>{t("afdruk.alleen", { naam: ex.naam })}</option>
              ))}
            </select>
          </span>
        )}
        <span className="av-rek" />
        <span className="av-zoom">
          <label htmlFor="av-zoom">{t("afdruk.zoom")}</label>
          <select
            id="av-zoom"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          >
            {ZOOMSTANDEN.map((z) => (
              <option key={z} value={z}>{Math.round(z * 100)}%</option>
            ))}
          </select>
        </span>
        <button className="av-primair" onClick={() => afdrukken()}>{t("afdruk.afdrukken")}</button>
        <button onClick={sluitVoorbeeld}>{t("afdruk.sluiten")}</button>
      </div>

      <div className="av-vellen" ref={schuifRef}>
        <div className="av-vellen-binnen" ref={vellenRef} style={{ zoom }} />
      </div>

      {/* De meetopstelling: buiten beeld, op de breedte van de bladspiegel van deze soort. */}
      <div
        className="av-meet print-opmaak"
        ref={meetRef}
        aria-hidden="true"
        style={{ width: `${maten.inhoud.breedte}mm` }}
      >
        {rapport ? <RapportAfdruk /> : <UitdraaiInhoud uitdraai={uitdraai} />}
      </div>
    </div>
  );
}
