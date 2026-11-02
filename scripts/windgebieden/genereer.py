"""Maakt packages/desktop/src/templates/nl-windgebieden.geojson: de windgebieden I, II en III
volgens de nationale bijlage bij NEN-EN 1991-1-4 (figuur NB.1):

  I   Markermeer, IJsselmeer, Waddenzee, Waddeneilanden en de provincie Noord-Holland ten
      noorden van 52°30′ noorderbreedte
  II  het resterende deel van Noord-Holland, het vasteland van Groningen en Friesland, en de
      provincies Flevoland, Zuid-Holland en Zeeland
  III het resterende deel van Nederland

De grenzen zijn dus provinciegrenzen, behalve die tussen gebied I en II in Noord-Holland:
daar is het een rechte, horizontale lijn op GRENS_BREEDTE (van de Noordzeekust tot het
Markermeer, ter hoogte van Heemskerk, Purmerend en Volendam), zoals op de kaart van de
bijlage. Een gepubliceerde kaart daarvan, geregistreerd op de wereld, legt de lijn op
ongeveer 52,52° (± 0,02°); GRENS_BREEDTE staat op 52°30′.

Bron: nl-provincies.geojson (naast dit script): CBS-provinciegrenzen via PDOK, alleen land.

De meren en de Waddenzee zijn met de hand getekend, ruim over de kust heen, en daarna met
het land weggeknipt: ze sluiten zo precies op de kustlijn aan.

Daarna maakt contour.py er per gebied één contour van (nl-windgebieden-contour.geojson).

Vereist Python 3 met shapely 2.  Draaien:  python scripts/windgebieden/genereer.py
"""
import json
import sys
from pathlib import Path

from shapely.geometry import box, shape, mapping, Polygon
from shapely.ops import unary_union

sys.stdout.reconfigure(encoding="utf-8")

HIER = Path(__file__).resolve().parent
UIT = HIER.parents[1] / "packages" / "desktop" / "src" / "templates" / "nl-windgebieden.geojson"
# De grens tussen gebied I en II in Noord-Holland: een breedtegraad.
GRENS_BREEDTE = 52.5  # 52°30′ N

prov = {f["properties"]["statnaam"]: shape(f["geometry"])
        for f in json.loads((HIER / "nl-provincies.geojson").read_text(encoding="utf-8"))["features"]}
NH = prov["Noord-Holland"]


def delen(geom):
    return list(geom.geoms) if hasattr(geom, "geoms") else [geom]


# Noord-Holland doorgesneden op de breedtegraad; Texel ligt erboven en valt zo vanzelf in I.
boven = box(3.0, GRENS_BREEDTE, 6.0, 54.0)
nh_noord = NH.intersection(boven)
nh_zuid = NH.difference(boven)


def eilanden_en_vasteland(geom):
    """Het grootste deel is het vasteland; de losse delen ten noorden ervan de eilanden."""
    stukken = sorted(delen(geom), key=lambda p: p.area, reverse=True)
    return stukken[0], [p for p in stukken[1:] if p.centroid.y > 53.2]


fr_vast, fr_eil = eilanden_en_vasteland(prov["Fryslân"])
gr_vast, gr_eil = eilanden_en_vasteland(prov["Groningen"])
print("Waddeneilanden: Fryslân", len(fr_eil), "· Groningen", len(gr_eil), "· Noord-Holland 1")

land = unary_union(list(prov.values()))
meren = Polygon([
    (4.93, 52.95), (5.10, 53.02), (5.30, 53.10), (5.42, 53.12), (5.47, 53.02), (5.45, 52.93),
    (5.40, 52.86), (5.62, 52.87), (5.78, 52.85), (5.70, 52.72), (5.665, 52.64), (5.635, 52.605),
    (5.60, 52.52), (5.48, 52.49), (5.36, 52.43), (5.22, 52.37), (5.08, 52.33), (4.98, 52.36),
    (4.99, 52.43), (4.99, 52.49), (4.99, 52.62), (5.03, 52.67), (5.20, 52.73), (5.08, 52.78),
    (5.04, 52.86), (4.93, 52.95),
]).difference(land)
wadden = Polygon([
    (4.72, 53.00), (4.78, 53.14), (4.96, 53.22), (5.05, 53.30), (5.20, 53.38), (5.45, 53.42),
    (5.70, 53.45), (5.95, 53.47), (6.20, 53.49), (6.50, 53.52), (6.85, 53.50), (7.05, 53.40),
    (7.20, 53.30), (7.00, 53.30), (6.85, 53.40), (6.60, 53.40), (6.35, 53.42), (6.10, 53.40),
    (5.85, 53.38), (5.60, 53.30), (5.45, 53.20), (5.38, 53.10), (5.20, 53.00), (5.05, 52.90),
    (4.85, 52.88), (4.70, 52.96), (4.72, 53.00),
]).difference(land).difference(meren)

kenmerken = []


def voeg_toe(geom, gebied, naam, soort="land"):
    geom = geom.simplify(0.0003, preserve_topology=True)
    # Snippers die bij het knippen overblijven, tellen niet mee.
    geom = unary_union([p for p in delen(geom) if p.area > 1e-6])
    if geom.is_empty:
        return
    kenmerken.append({"type": "Feature", "properties": {"gebied": gebied, "naam": naam, "soort": soort},
                      "geometry": mapping(geom)})


voeg_toe(nh_noord, 1, "Noord-Holland, ten noorden van 52°30′ N")
for p in fr_eil:
    voeg_toe(p, 1, "Waddeneiland (Fryslân)")
for p in gr_eil:
    voeg_toe(p, 1, "Waddeneiland (Groningen)")
voeg_toe(nh_zuid, 2, "Noord-Holland, ten zuiden van 52°30′ N")
voeg_toe(fr_vast, 2, "Fryslân, vasteland")
voeg_toe(gr_vast, 2, "Groningen, vasteland")
for n in ("Flevoland", "Zuid-Holland", "Zeeland"):
    voeg_toe(prov[n], 2, n)
for n in ("Drenthe", "Overijssel", "Gelderland", "Utrecht", "Noord-Brabant", "Limburg"):
    voeg_toe(prov[n], 3, n)
voeg_toe(meren, 1, "IJsselmeer en Markermeer", "water")
voeg_toe(wadden, 1, "Waddenzee", "water")


def afronden(obj):
    if isinstance(obj, float):
        return round(obj, 5)
    if isinstance(obj, (list, tuple)):
        return [afronden(o) for o in obj]
    if isinstance(obj, dict):
        return {k: afronden(v) for k, v in obj.items()}
    return obj


tekst = json.dumps({"type": "FeatureCollection", "features": afronden(kenmerken)},
                   ensure_ascii=False, separators=(",", ":"))
UIT.write_text(tekst, encoding="utf-8", newline="")
print(f"{UIT.name}: {len(tekst) // 1000} kB, {len(kenmerken)} vlakken")

# Per gebied één contour, voor de selectie op de kaart in de app.
from contour import maak_contouren  # noqa: E402

maak_contouren(UIT)
