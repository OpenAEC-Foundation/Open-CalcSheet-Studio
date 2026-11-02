"""Maakt packages/desktop/src/templates/nl-windgebieden-contour.geojson: per windgebied (I, II, III)
één vlak, de vereniging van alle vlakken van dat gebied in nl-windgebieden.geojson (land en water).

De kaart in de app tekent hiermee het gebied waarin een gekozen plek ligt als één contour, zonder
de provinciegrenzen binnen het gebied. Het rekenwerk (welk gebied, afstand tot de grens) blijft op
nl-windgebieden.geojson draaien; scripts/check-windgebieden.mjs toetst dat beide kloppen.

De vlakken zijn per stuk vereenvoudigd, dus gedeelde grenzen vallen niet overal precies samen.
Een kleine buffer heen en terug (0,0002°, zo'n 20 m) dicht die naden, zonder de echte gaten
(Oosterschelde, Haringvliet, Veerse Meer) te vullen.

Vereist Python 3 met shapely 2.  Draaien:  python scripts/windgebieden/contour.py
genereer.py roept dit ook aan, na het maken van de kaartdata.
"""
import json
import sys
from pathlib import Path

from shapely import set_precision
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

HIER = Path(__file__).resolve().parent
TEMPLATES = HIER.parents[1] / "packages" / "desktop" / "src" / "templates"
IN = TEMPLATES / "nl-windgebieden.geojson"
UIT = TEMPLATES / "nl-windgebieden-contour.geojson"

NAAD = 0.0002
NAMEN = {1: "Windgebied I", 2: "Windgebied II", 3: "Windgebied III"}


def delen(geom):
    return list(geom.geoms) if hasattr(geom, "geoms") else [geom]


def afronden(obj):
    if isinstance(obj, float):
        return round(obj, 5)
    if isinstance(obj, (list, tuple)):
        return [afronden(o) for o in obj]
    if isinstance(obj, dict):
        return {k: afronden(v) for k, v in obj.items()}
    return obj


def maak_contouren(pad_in=IN, pad_uit=UIT):
    kaart = json.loads(Path(pad_in).read_text(encoding="utf-8"))
    kenmerken = []
    for gebied in (1, 2, 3):
        vlakken = [shape(f["geometry"]) for f in kaart["features"] if f["properties"]["gebied"] == gebied]
        geom = unary_union([v.buffer(NAAD, join_style="mitre") for v in vlakken]).buffer(-NAAD, join_style="mitre")
        geom = unary_union([p for p in delen(geom) if p.area > 1e-6])
        # Op het raster van 5 decimalen, zoals de kaartdata; zo blijven de ringen geldig.
        geom = set_precision(geom, 1e-5)
        kenmerken.append({"type": "Feature", "properties": {"gebied": gebied, "naam": NAMEN[gebied]},
                          "geometry": mapping(geom)})
        print(f"contour gebied {gebied}: {len(delen(geom))} delen, "
              f"{sum(len(p.interiors) for p in delen(geom))} gaten")
    tekst = json.dumps({"type": "FeatureCollection", "features": afronden(kenmerken)},
                       ensure_ascii=False, separators=(",", ":"))
    Path(pad_uit).write_text(tekst, encoding="utf-8", newline="")
    print(f"{Path(pad_uit).name}: {len(tekst) // 1000} kB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    maak_contouren()
