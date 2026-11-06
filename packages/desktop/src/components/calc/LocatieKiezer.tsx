import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useProjectStore } from "../../store/projectStore";
import { leesCoordinaten, leesPunt, puntJson, puntTekst, type Punt } from "../../kaart/punt.ts";
import { zoekAdres, type Uitkomst } from "../../kaart/nominatim.ts";
import { maakKaartbeeld } from "../../kaart/beeld.ts";
import { schaalTekst } from "../../kaart/tegels.ts";
import { meetWater } from "../../kaart/overpass.ts";
import { KAARTEN, situatieBijPunt, waterTekst, type Kaartbeeld, type Water } from "../../rapport/situatie.ts";
import { useBeeldEenheden } from "./useBeeldEenheden";
import type { BeeldEenheden } from "./beeldEenheden";
import "./LocatieKiezer.css";

// Dezelfde speld als op de windkaart (de standaardafbeeldingen van Leaflet
// vinden onder een bundler hun pad niet).
const speld = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

const WERELD: [number, number] = [25, 10];

const BRON = "© OpenStreetMap contributors";

/** Vandaag in de tijd van de gebruiker, als "JJJJ-MM-DD". */
function vandaag(): string {
  const d = new Date();
  const twee = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;
}

/**
 * Het beeld van kaart `k` voor de situatie, met schaalbalk in de taal van het rapport en, als
 * er een gemeten water is, de lijn ernaartoe met afstand en naam in diezelfde taal.
 */
function beeldVan(p: Punt, k: (typeof KAARTEN)[number], eenheden: BeeldEenheden, water?: Water | null): Promise<Kaartbeeld> {
  const taal = useProjectStore.getState().rapport.taal;
  return maakKaartbeeld(p, k, {
    bron: BRON,
    // De teksten in het beeld volgen de taal van het rapport, zoals de rest van de afdruk.
    schaalLabel: (m) => schaalTekst(m, eenheden, taal),
    ...(water && k.id === "omgeving"
      ? { water: { punt: water.punt, label: waterTekst(water, eenheden, taal, i18next.getFixedT(taal, "rapport")) } }
      : {}),
  });
}

/** Een klik op de kaart zet de speld daar. */
function KlikOpKaart({ onKlik }: { onKlik: (p: Punt) => void }) {
  useMapEvents({
    click: (e) => {
      // Leaflet geeft de lengtegraad niet genormaliseerd terug (bij zoom 1 of na schuiven bijv. 190).
      const l = e.latlng.wrap();
      onKlik({ lat: l.lat, lon: l.lng });
    },
  });
  return null;
}

/**
 * Houdt het punt in beeld: staat het buiten de kaart (ongedaan maken, een ander project, een
 * wijziging via de API), dan schuift de kaart ernaartoe. Na een zoekuitkomst (`inzoomen`)
 * gaat de kaart ook dichterbij. Bij een klik of slepen blijft hij staan.
 */
function VolgPunt({ punt, inzoomen }: { punt: Punt | null; inzoomen: MutableRefObject<boolean> }) {
  const kaart = useMap();
  const lat = punt?.lat;
  const lon = punt?.lon;
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    const doel = L.latLng(lat, lon);
    if (inzoomen.current) {
      inzoomen.current = false;
      kaart.setView(doel, 15);
    } else if (!kaart.getBounds().contains(doel)) {
      kaart.setView(doel, Math.max(kaart.getZoom(), 15));
    }
  }, [lat, lon, kaart, inzoomen]);
  return null;
}

/**
 * Onder het veld "Locatie" in de projectgegevens: het adres zoeken en de plek op een kaart
 * kiezen. Het gekozen punt staat als `locatie_punt` in de projectgegevens (zie kaart/punt.ts).
 */
export default function LocatieKiezer() {
  const { t, i18n } = useTranslation("werkruimte");
  const gegevens = useProjectStore((s) => s.gegevens);
  const zetGegeven = useProjectStore((s) => s.zetGegeven);
  const punt = leesPunt(gegevens.locatie_punt);
  const situatie = useProjectStore((s) => s.rapport.situatie);
  const werkRapportBij = useProjectStore((s) => s.werkRapportBij);
  const eenheden = useBeeldEenheden();
  const eenhedenRef = useRef(eenheden);
  eenhedenRef.current = eenheden;
  const stand = situatieBijPunt(situatie, punt);

  const [tekst, setTekst] = useState(gegevens.locatie ?? "");
  const [uitkomsten, setUitkomsten] = useState<Uitkomst[]>([]);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  // Gezet bij een zoekuitkomst: de kaart gaat dan ook dichterbij.
  const inzoomen = useRef(false);
  // Alleen het laatste antwoord telt als je snel twee keer zoekt.
  const volgnummer = useRef(0);
  const [kaartenBezig, setKaartenBezig] = useState(false);
  const [kaartenMelding, setKaartenMelding] = useState<string | null>(null);
  // Alleen de laatste opdracht om kaarten te maken telt.
  const kaartNummer = useRef(0);
  const [waterBezig, setWaterBezig] = useState(false);
  const [waterMelding, setWaterMelding] = useState<string | null>(null);
  // Alleen de laatste meting telt.
  const waterNummer = useRef(0);

  /**
   * Maakt de drie kaarten achter elkaar en schrijft ze pas als alle drie klaar zijn, met één
   * wijziging van het rapport. Bij een fout blijft de oude situatie staan.
   */
  const maakKaarten = useCallback(
    async (p: Punt) => {
      const nummer = ++kaartNummer.current;
      setKaartenMelding(null);
      setKaartenBezig(true);
      // Een lopende meting is hiermee achterhaald: de kaarten worden opnieuw gemaakt.
      waterNummer.current++;
      setWaterBezig(false);
      // Het water hoort bij het oude punt en blijft alleen staan als het punt hetzelfde is; dan
      // krijgt de omgevingskaart ook weer zijn lijn.
      const voor = useProjectStore.getState().rapport.situatie;
      const behoud = voor && situatieBijPunt(voor, p) === "actueel" ? voor.water : undefined;
      try {
        const kaarten: Kaartbeeld[] = [];
        for (const k of KAARTEN) {
          // Is de opdracht intussen vervangen, dan haalt hij geen tegels meer.
          if (nummer !== kaartNummer.current) return;
          kaarten.push(await beeldVan(p, k, eenhedenRef.current, behoud));
        }
        if (nummer !== kaartNummer.current) return;
        // Het punt kan intussen verplaatst of gewist zijn: dan horen deze kaarten er niet meer bij.
        const nu = leesPunt(useProjectStore.getState().gegevens.locatie_punt);
        if (!nu || situatieBijPunt({ tonen: true, punt: p, datum: "", kaarten }, nu) !== "actueel") return;
        // Bij vernieuwen blijft het vinkje zoals het was; het water (ook "geen water") blijft
        // alleen staan als het punt hetzelfde is, en is het water waarmee de kaart getekend is.
        werkRapportBij((r) => ({
          ...r,
          situatie: {
            tonen: r.situatie ? r.situatie.tonen : true,
            punt: p,
            datum: vandaag(),
            kaarten,
            ...(behoud !== undefined ? { water: behoud } : {}),
          },
        }));
      } catch {
        if (nummer !== kaartNummer.current) return;
        setKaartenMelding(t("gegevens.situatie.kaartenMislukt"));
      } finally {
        if (nummer === kaartNummer.current) setKaartenBezig(false);
      }
    },
    [i18n.language, t, werkRapportBij],
  );

  /**
   * Meet het open water bij het punt van de situatie, tekent de lijn in de omgevingskaart en
   * schrijft water en kaart samen met één wijziging van het rapport. Bij een fout (netwerk,
   * time-out, 429) blijft alles zoals het was.
   */
  const meetAfstand = useCallback(
    async (p: Punt) => {
      const nummer = ++waterNummer.current;
      const kaartMoment = kaartNummer.current;
      setWaterMelding(null);
      setWaterBezig(true);
      // Is er intussen iets veranderd (een andere meting, nieuwe kaarten, een ander punt)?
      const verlopen = () => {
        if (nummer !== waterNummer.current || kaartMoment !== kaartNummer.current) return true;
        const state = useProjectStore.getState();
        const nu = leesPunt(state.gegevens.locatie_punt);
        return !nu || situatieBijPunt(state.rapport.situatie, nu) !== "actueel" || situatieBijPunt(state.rapport.situatie, p) !== "actueel";
      };
      try {
        const water = await meetWater(p);
        if (verlopen()) return;
        const omgeving = KAARTEN.find((k) => k.id === "omgeving")!;
        const beeld = await beeldVan(p, omgeving, eenhedenRef.current, water);
        if (verlopen()) return;
        werkRapportBij((r) =>
          r.situatie
            ? { ...r, situatie: { ...r.situatie, water, kaarten: r.situatie.kaarten.map((k) => (k.id === "omgeving" ? beeld : k)) } }
            : r,
        );
      } catch {
        if (nummer !== waterNummer.current) return;
        setWaterMelding(t("gegevens.situatie.waterMislukt"));
      } finally {
        if (nummer === waterNummer.current) setWaterBezig(false);
      }
    },
    [t, werkRapportBij],
  );

  const zetPunt = useCallback(
    (p: Punt, naam?: string) => {
      zetGegeven("locatie_punt", puntJson(p));
      const huidig = useProjectStore.getState().gegevens.locatie ?? "";
      if (naam && !huidig.trim()) zetGegeven("locatie", naam);
      // Het eerste punt van het project maakt de kaarten vanzelf; daarna beslist de gebruiker
      // met de knop, zodat een speld slepen niet elke keer tegels haalt.
      if (!useProjectStore.getState().rapport.situatie) void maakKaarten(p);
    },
    [zetGegeven, maakKaarten],
  );

  const zoek = useCallback(async () => {
    const vraag = tekst.trim();
    if (!vraag) return;
    const nummer = ++volgnummer.current;
    setMelding(null);
    setUitkomsten([]);
    // Een paar coördinaten hoeft niet bij de dienst te worden opgezocht.
    const coord = leesCoordinaten(vraag);
    if (coord) {
      inzoomen.current = true;
      zetPunt(coord);
      setBezig(false);
      return;
    }
    setBezig(true);
    try {
      const gevonden = await zoekAdres(vraag, i18n.language);
      if (nummer !== volgnummer.current) return;
      setUitkomsten(gevonden);
      if (gevonden.length === 0) setMelding(t("gegevens.situatie.nietGevonden"));
    } catch {
      if (nummer !== volgnummer.current) return;
      setMelding(t("gegevens.situatie.zoekenMislukt"));
    } finally {
      if (nummer === volgnummer.current) setBezig(false);
    }
  }, [tekst, i18n.language, t, zetPunt]);

  const kies = (u: Uitkomst) => {
    inzoomen.current = true;
    zetPunt(u.punt, u.naam);
    setUitkomsten([]);
    setMelding(null);
  };

  const wis = () => {
    zetGegeven("locatie_punt", "");
  };

  return (
    <div className="lk">
      <span className="pg-label">{t("gegevens.situatie.titel")}</span>
      <span className="pg-hint">{t("gegevens.situatie.hint")}</span>
      <div className="lk-zoek">
        <input
          type="text"
          aria-label={t("gegevens.situatie.adres")}
          placeholder={t("gegevens.situatie.adresVoorbeeld")}
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void zoek();
            }
          }}
        />
        <button type="button" className="lk-knop" onClick={() => void zoek()} disabled={!tekst.trim()}>
          {bezig ? t("gegevens.situatie.zoekt") : t("gegevens.situatie.zoeken")}
        </button>
      </div>
      {melding && <div className="lk-melding" role="status">{melding}</div>}
      {uitkomsten.length > 0 && (
        <ul className="lk-uitkomsten">
          {uitkomsten.map((u, i) => (
            <li key={i}>
              <button type="button" className="lk-uitkomst" onClick={() => kies(u)}>{u.naam}</button>
            </li>
          ))}
        </ul>
      )}
      {/* De kaarttegels zijn in elk thema licht; de kaart volgt daarom het lichte thema. */}
      <div className="lk-kaart" data-oa-theme="light">
        <MapContainer
          center={punt ? [punt.lat, punt.lon] : WERELD}
          zoom={punt ? 15 : 2}
          className="lk-leaflet"
          scrollWheelZoom={false}
          worldCopyJump
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {punt && (
            <Marker
              position={[punt.lat, punt.lon]}
              icon={speld}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = (e.target as L.Marker).getLatLng().wrap();
                  zetPunt({ lat: p.lat, lon: p.lng });
                },
              }}
            />
          )}
          <VolgPunt punt={punt} inzoomen={inzoomen} />
          <KlikOpKaart onKlik={(p) => zetPunt(p)} />
        </MapContainer>
      </div>
      {punt && (
        <div className="lk-kaarten">
          <button type="button" className="lk-knop" onClick={() => void maakKaarten(punt)} disabled={kaartenBezig}>
            {kaartenBezig
              ? t("gegevens.situatie.kaartenBezig")
              : situatie
                ? t("gegevens.situatie.kaartenVernieuwen")
                : t("gegevens.situatie.kaartenMaken")}
          </button>
          {stand === "verouderd" && !kaartenBezig && (
            <span className="lk-melding" role="status">{t("gegevens.situatie.verouderd")}</span>
          )}
        </div>
      )}
      {kaartenMelding && <div className="lk-melding" role="status">{kaartenMelding}</div>}
      {punt && situatie && stand === "actueel" && (
        <div className="lk-kaarten">
          <button type="button" className="lk-knop" onClick={() => void meetAfstand(punt)} disabled={waterBezig || kaartenBezig}>
            {waterBezig ? t("gegevens.situatie.waterBezig") : t("gegevens.situatie.waterMeten")}
          </button>
        </div>
      )}
      {waterMelding && <div className="lk-melding" role="status">{waterMelding}</div>}
      <div className="lk-voet">
        <span className="lk-coord">
          {punt ? puntTekst(punt, i18n.language) : t("gegevens.situatie.geenPunt")}
        </span>
        {punt && (
          <button type="button" className="lk-knop lk-knop-rustig" onClick={wis}>
            {t("gegevens.situatie.wis")}
          </button>
        )}
      </div>
    </div>
  );
}
