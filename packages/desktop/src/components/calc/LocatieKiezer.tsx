import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useProjectStore } from "../../store/projectStore";
import { leesCoordinaten, leesPunt, puntJson, puntTekst, type Punt } from "../../kaart/punt.ts";
import { zoekAdres, type Uitkomst } from "../../kaart/nominatim.ts";
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

  const [tekst, setTekst] = useState(gegevens.locatie ?? "");
  const [uitkomsten, setUitkomsten] = useState<Uitkomst[]>([]);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  // Gezet bij een zoekuitkomst: de kaart gaat dan ook dichterbij.
  const inzoomen = useRef(false);
  // Alleen het laatste antwoord telt als je snel twee keer zoekt.
  const volgnummer = useRef(0);

  const zetPunt = useCallback(
    (p: Punt, naam?: string) => {
      zetGegeven("locatie_punt", puntJson(p));
      const huidig = useProjectStore.getState().gegevens.locatie ?? "";
      if (naam && !huidig.trim()) zetGegeven("locatie", naam);
    },
    [zetGegeven],
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
