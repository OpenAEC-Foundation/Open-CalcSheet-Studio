"""Controleer het geïnstalleerde Linux-pakket via de lokale API onder Xvfb."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen


def api(route, token, body=None):
    data = None if body is None else json.dumps(body).encode()
    poort = int(os.environ.get("OCSS_PROEF_POORT", "3879"))
    request = Request(f"http://127.0.0.1:{poort}/api/v1/" + route, data=data,
                      headers={"Authorization": "Bearer " + token,
                               "Content-Type": "application/json"})
    with urlopen(request, timeout=90) as response:
        return json.load(response)


def controleer(mapnaam):
    env = os.environ.copy()
    for key in ("XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"):
        env[key] = str(mapnaam / key)
    app = subprocess.Popen(["open-calcsheet-studio", "--headless"], env=env)
    try:
        einde = time.monotonic() + 90
        while time.monotonic() < einde:
            if app.poll() is not None:
                raise RuntimeError(f"App gestopt met code {app.returncode}")
            try:
                prefs = next(mapnaam.rglob("preferences.json"))
                token = json.loads(prefs.read_text())["mcpToken"]
                api("info", token)
                break
            except (StopIteration, KeyError, ValueError, URLError):
                time.sleep(0.5)
        else:
            raise RuntimeError("Headless API niet bereikbaar")
        marker = "Linuxproefberekening"
        blad = api("sheets", token, {"name": "Rekenblad", "source": f'"{marker}\na = 2*3\n'})
        api("sheets/" + blad["id"] + "?evaluate=true", token)
        pad = mapnaam / "proef rapport.pdf"
        resultaat = api("report/export/pdf", token, {"path": str(pad)})
        if resultaat["bytes"] != pad.stat().st_size:
            raise RuntimeError("Aantal PDF-bytes wijkt af")
        tekst = subprocess.check_output(["pdftotext", str(pad), "-"], text=True)
        if marker not in tekst:
            raise RuntimeError("Rekenblad ontbreekt in de geëxporteerde PDF")
        # Neem de eerste pagina van de zojuist geschreven PDF als bijlage op.
        subprocess.run(["pdfseparate", "-f", "1", "-l", "1", str(pad),
                        str(mapnaam / "bijlage-%d.pdf")], check=True)
        api("sheets/pdf", token, {"path": str(mapnaam / "bijlage-1.pdf"), "name": "PDF-proefblad"})
        met_bijlage = mapnaam / "rapport met bijlage.pdf"
        resultaat = api("report/export/pdf", token, {"path": str(met_bijlage)})
        if resultaat["bytes"] != met_bijlage.stat().st_size:
            raise RuntimeError("Aantal PDF-bytes met bijlage wijkt af")
        beelden = subprocess.check_output(["pdfimages", "-list", str(met_bijlage)], text=True)
        if not any(regel.split()[2:3] == ["image"] for regel in beelden.splitlines()):
            raise RuntimeError("De afbeelding van het PDF-blad ontbreekt")
        api("info", token)
        print(f"Headless export gecontroleerd ({pad.stat().st_size} bytes)")
    finally:
        app.terminate()
        try:
            app.wait(timeout=5)
        except subprocess.TimeoutExpired:
            app.kill()
            app.wait()


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as werkmap:
        controleer(Path(werkmap))
