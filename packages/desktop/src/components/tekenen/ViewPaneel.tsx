import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { VEL_SCHALEN, type TekenView } from "../../store/tekenBlad";
import { kernGetal } from "./code";
import { leesVeldmaten, passendeSchaal, schaalTekst, stramienRaster, viewBereik, zetViewSchaal } from "./vel";
import { useTeken, wijzig, wijzigOpenView } from "./tekenStore";

/** De schaal van een view: de gangbare schalen, en een eigen 1 : n als hij daar niet tussen staat. */
export function SchaalKeuze({ waarde, onZet }: { waarde: number; onZet: (n: number) => void }) {
  const { t } = useTranslation("tekenen");
  return (
    <div className="tk-rij">
      <label title={t("view.schaalTip")}>{t("view.schaal")}</label>
      <select className="tk-veld" value={waarde} onChange={(e) => onZet(Number(e.target.value))}>
        {!(VEL_SCHALEN as readonly number[]).includes(waarde) && <option value={waarde}>{schaalTekst(waarde)}</option>}
        {VEL_SCHALEN.map((n) => <option key={n} value={n}>{schaalTekst(n)}</option>)}
      </select>
    </div>
  );
}

/** Rechts in de editor, zonder selectie: de titel en schaal van de view en het stramien. */
export default function ViewPaneel() {
  const { t } = useTranslation("tekenen");
  const vel = useTeken((s) => s.vel);
  const view = useProjectStore((s) =>
    s.exemplaren.find((e) => e.id === vel?.exId)?.tekenvel?.views.find((v) => v.id === vel?.viewId),
  );
  if (!view) return null;
  const bereik = viewBereik(view);
  return (
    <>
      <section className="tk-sectie">
        <div className="tk-sectie-kop"><span>{t("view.kop")}</span></div>
        <div className="tk-rij">
          <label>{t("view.titel")}</label>
          <input className="tk-veld" value={view.titel} onChange={(e) => wijzigOpenView((v) => ({ ...v, titel: e.target.value }))} />
        </div>
        <SchaalKeuze waarde={view.schaal} onZet={(n) => wijzigOpenView((v) => zetViewSchaal(v, n))} />
        <p className="tk-uitleg tk-zacht">
          {t("view.bereik", { b: kernGetal(Math.round(bereik.breedte)), h: kernGetal(Math.round(bereik.hoogte)) })}
        </p>
        <p className="tk-uitleg tk-zacht">{t("view.uitleg")}</p>
      </section>
      <StramienSectie view={view} />
    </>
  );
}

/** Wat je hier invulde blijft staan als het paneel even iets anders laat zien, zoals de eigenschappen van een vorm. */
let onthouden: { x: string; y: string; uitloop: string; maatvoering: boolean } | null = null;

/** Een eerste voorstel: twee velden in x en y van een gangbare maat, zodat het op deze schaal in de view past. */
function voorstelRaster(view: TekenView) {
  const { breedte, hoogte } = viewBereik(view);
  // De uitloop: zo'n 30 mm op papier, afgerond op 100 mm.
  const uitloop = Math.max(100, Math.round((30 * view.schaal) / 100) * 100);
  const rand = 2 * uitloop + 12 * view.schaal;
  const maat = (ruimte: number) => [7200, 6000, 5400, 4800, 3600, 2400, 1200, 600, 300].find((m) => 2 * m + rand <= ruimte) ?? 300;
  return { x: `2x${maat(breedte)}`, y: `2x${maat(hoogte)}`, uitloop: String(uitloop), maatvoering: true };
}

/** Een stramien in één keer: de veldmaten in x en y, midden in de view, met assen en maatvoering. */
function StramienSectie({ view }: { view: TekenView }) {
  const { t } = useTranslation("tekenen");
  const stijl = useTeken((s) => s.stijl);
  const [invoer, setInvoer] = useState(() => onthouden ?? voorstelRaster(view));
  const zet = (deel: Partial<typeof invoer>) => {
    onthouden = { ...invoer, ...deel };
    setInvoer(onthouden);
  };
  const { x, y, uitloop, maatvoering } = invoer;
  const velden = useMemo(() => ({ x: leesVeldmaten(x), y: leesVeldmaten(y), uitloop: Number(uitloop.replace(",", ".")) }), [x, y, uitloop]);
  const goed = !!velden.x && !!velden.y && velden.uitloop >= 0;
  const som = (l: number[] | null) => (l ?? []).reduce((a, b) => a + b, 0);
  // Met de uitloop en de bollen erbij; de bollen zijn zo'n 6 mm op papier.
  const breedte = som(velden.x) + 2 * (velden.uitloop || 0) + 12 * view.schaal;
  const hoogte = som(velden.y) + 2 * (velden.uitloop || 0) + 12 * view.schaal;
  const bereik = viewBereik(view);
  const past = breedte <= bereik.breedte && hoogte <= bereik.hoogte;
  const voorstel = goed && !past ? passendeSchaal(view, breedte, hoogte) : null;

  const plaats = () => {
    if (!velden.x || !velden.y) return;
    const x0 = view.x0 + (bereik.breedte - som(velden.x)) / 2;
    const y0 = view.y0 + (bereik.hoogte - som(velden.y)) / 2;
    const vormen = stramienRaster(
      { x: velden.x, y: velden.y, x0: Math.round(x0 / 100) * 100, y0: Math.round(y0 / 100) * 100, uitloop: velden.uitloop, maatvoering },
      stijl,
    );
    wijzig((tk) => ({ ...tk, elementen: [...tk.elementen, ...vormen] }));
    useTeken.setState({ gekozen: [] });
  };

  return (
    <section className="tk-sectie">
      <div className="tk-sectie-kop"><span>{t("view.stramienKop")}</span></div>
      <div className="tk-rij">
        <label title={t("view.veldenTip")}>{t("view.veldenX")}</label>
        <input className={`tk-veld${velden.x ? "" : " tk-fout"}`} value={x} spellCheck={false} onChange={(e) => zet({ x: e.target.value })} />
      </div>
      <div className="tk-rij">
        <label title={t("view.veldenTip")}>{t("view.veldenY")}</label>
        <input className={`tk-veld${velden.y ? "" : " tk-fout"}`} value={y} spellCheck={false} onChange={(e) => zet({ y: e.target.value })} />
      </div>
      <div className="tk-rij">
        <label>{t("view.uitloop")}</label>
        <input className="tk-veld" value={uitloop} spellCheck={false} onChange={(e) => zet({ uitloop: e.target.value })} />
      </div>
      <div className="tk-rij">
        <label>{t("view.maatvoering")}</label>
        <input type="checkbox" checked={maatvoering} onChange={(e) => zet({ maatvoering: e.target.checked })} />
      </div>
      {goed && !past && (
        <p className="tk-uitleg tk-let-op">
          {voorstel ? t("view.pastNiet", { schaal: schaalTekst(voorstel) }) : t("view.pastNooit")}
        </p>
      )}
      <div className="tk-knoppen">
        <button className="tk-knop" disabled={!goed} onClick={plaats}>{t("view.stramienPlaatsen")}</button>
      </div>
      <p className="tk-uitleg tk-zacht">{t("view.stramienUitleg")}</p>
    </section>
  );
}
