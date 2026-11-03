//! De Jupyter-omgeving: een kleine statische server op 127.0.0.1.
//!
//! Een Jupyter-blad draait JupyterLite met een Pyodide-kernel in een iframe. Die
//! heeft een service worker nodig om bij zijn bestanden te komen, en een service
//! worker laadt niet via het app-protocol van Tauri. Daarom serveert deze server
//! de omgeving vanaf loopback, uit één pakbestand in de resources
//! (`jupyter-omgeving/omgeving.pak`, gemaakt door
//! `scripts/bouw-jupyter-omgeving.mjs`).
//!
//! Elk blad krijgt een eigen herkomst: `http://blad-<sleutel>.localhost:<poort>`.
//! Zo delen twee bladen geen opslag, geen service worker en geen kernel.
//!
//! De afscherming staat in de antwoordkoppen (`CSP`): geen verzoek naar buiten,
//! ook niet vanuit Python, geen script uit de uitvoer van een cel, en alleen de app
//! zelf mag de pagina insluiten. De buitenste iframe
//! (`components/calc/JupyterVenster.tsx`) houdt daarnaast tegen dat de pagina zichzelf
//! naar buiten navigeert.
//!
//! Hier staat alleen statische inhoud en geen projectgegevens: de bestanden van een
//! blad gaan via `postMessage` rechtstreeks de iframe in. Alleen GET en HEAD, en
//! alleen op de eigen hostnamen (DNS-rebinding).

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use tauri::Manager;

/// De eerste acht bytes van het pakbestand; de cijfers zijn de versie van de indeling.
const PAK_KOP: &[u8; 8] = b"OCSSPAK1";

/// Waar het pakbestand in de resources staat.
const PAK_PAD: &str = "jupyter-omgeving/omgeving.pak";

/// De voorkeurspoorten: bij dezelfde poort blijft de herkomst van een blad gelijk,
/// en loopt de opslag van WebView2 niet vol met oude herkomsten. Zijn ze bezet,
/// dan kiest het systeem er een.
const VOORKEUR_POORTEN: std::ops::RangeInclusive<u16> = 47631..=47650;

/// Aantal threads dat antwoorden schrijft; de kernel haalt tientallen bestanden tegelijk.
const WERKERS: usize = 4;

/// Geen verzoek naar buiten (`connect-src`, `img-src`, `font-src`, ...).
///
/// Geen `unsafe-inline` in `script-src`: HTML uit de uitvoer van een cel kan zo geen
/// script starten, ook niet na uitvoeren. Dat is ook de afscherming tegen WebRTC: een
/// CSP kan dat in WebView2 niet tegenhouden (gemeten: STUN gaat de deur uit, ook met
/// `webrtc 'block'`), en het bestaat alleen in het venster, niet in de worker van Python.
/// `unsafe-eval` is nodig voor JupyterLab (de controle van de instellingen) en Pyodide;
/// wat uit de uitvoer van een cel een tekst zou evalueren, staat uit in `jupyter-lite.json`.
/// De iframe mag alleen in de app staan.
const CSP: &str = "default-src 'self'; \
    script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; \
    style-src 'self' 'unsafe-inline' blob: data:; \
    img-src 'self' data: blob:; \
    font-src 'self' data:; \
    media-src 'self' data: blob:; \
    connect-src 'self' data: blob:; \
    worker-src 'self'; \
    frame-src 'self'; \
    object-src 'none'; \
    base-uri 'self'; \
    form-action 'none'; \
    frame-ancestors http://tauri.localhost tauri://localhost http://localhost:3021";

// ---------------------------------------------------------------------------
// Pure bouwstenen.
// ---------------------------------------------------------------------------

/// Is dit de `Host` van een blad op deze poort? Alleen kleine letters, cijfers en een
/// streepje in de sleutel; `Host` is onder controle van de aanroeper.
fn host_toegestaan(host: Option<&str>, poort: u16) -> bool {
    let Some(host) = host else { return false };
    let Some(naam) = host.strip_suffix(&format!(".localhost:{poort}")) else { return false };
    let Some(sleutel) = naam.strip_prefix("blad-") else { return false };
    !sleutel.is_empty() && sleutel.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Het pad van een verzoek als naam in het pakbestand: zonder query en voorste
/// streep, procent-gedecodeerd. Een map geeft zijn `index.html`.
fn pad_in_pak(url: &str) -> Option<String> {
    let kaal = url.split(['?', '#']).next().unwrap_or("");
    let bytes = kaal.as_bytes();
    let mut uit = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            uit.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            uit.push(bytes[i]);
            i += 1;
        }
    }
    let tekst = String::from_utf8(uit).ok()?;
    let naam = tekst.trim_start_matches('/');
    Some(if naam.is_empty() || naam.ends_with('/') { format!("{naam}index.html") } else { naam.to_string() })
}

fn inhoudstype(naam: &str) -> &'static str {
    match naam.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "webmanifest" => "application/json",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "eot" => "application/vnd.ms-fontobject",
        "zip" | "whl" => "application/zip",
        "txt" | "py" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Het pakbestand: `OCSSPAK1`, de lengte van de index (u64, little-endian), de index
/// als JSON `{naam: [begin, lengte]}` met het begin gerekend vanaf de eerste byte
/// achter de index, en dan alle bestanden achter elkaar.
struct Pak {
    pad: PathBuf,
    begin: u64,
    index: HashMap<String, (u64, u64)>,
}

impl Pak {
    fn open(pad: &Path) -> Result<Self, String> {
        let mut f = std::fs::File::open(pad).map_err(|e| format!("{}: {e}", pad.display()))?;
        let mut kop = [0u8; 16];
        f.read_exact(&mut kop).map_err(|e| format!("{}: {e}", pad.display()))?;
        if &kop[..8] != PAK_KOP {
            return Err(format!("{}: geen pakbestand van deze versie", pad.display()));
        }
        let lengte = u64::from_le_bytes(kop[8..16].try_into().map_err(|_| "kop".to_string())?);
        let mut json = vec![0u8; lengte as usize];
        f.read_exact(&mut json).map_err(|e| format!("{}: {e}", pad.display()))?;
        let index = serde_json::from_slice(&json).map_err(|e| format!("{}: {e}", pad.display()))?;
        Ok(Self { pad: pad.to_path_buf(), begin: 16 + lengte, index })
    }

    fn lees(&self, naam: &str) -> Option<Vec<u8>> {
        let &(begin, lengte) = self.index.get(naam)?;
        let mut f = std::fs::File::open(&self.pad).ok()?;
        f.seek(SeekFrom::Start(self.begin + begin)).ok()?;
        let mut uit = vec![0u8; lengte as usize];
        f.read_exact(&mut uit).ok()?;
        Some(uit)
    }
}

// ---------------------------------------------------------------------------
// Server.
// ---------------------------------------------------------------------------

fn koppen(soort: &str) -> Vec<tiny_http::Header> {
    [
        ("Content-Type", soort),
        ("Content-Security-Policy", CSP),
        ("X-Content-Type-Options", "nosniff"),
        ("Cross-Origin-Resource-Policy", "same-origin"),
        ("Referrer-Policy", "no-referrer"),
        // Geen kopie per blad in de schijfcache: de bron staat al op deze computer.
        ("Cache-Control", "no-store"),
    ]
    .iter()
    .filter_map(|(k, w)| tiny_http::Header::from_bytes(k.as_bytes(), w.as_bytes()).ok())
    .collect()
}

fn leeg(status: u16) -> tiny_http::Response<std::io::Empty> {
    tiny_http::Response::new(status.into(), koppen("text/plain"), std::io::empty(), Some(0), None)
}

fn beantwoord(verzoek: tiny_http::Request, pak: &Pak, poort: u16) {
    let host = verzoek
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("host"))
        .map(|h| h.value.as_str().to_string());
    if !host_toegestaan(host.as_deref(), poort) {
        let _ = verzoek.respond(leeg(403));
        return;
    }
    if !matches!(verzoek.method(), tiny_http::Method::Get | tiny_http::Method::Head) {
        let _ = verzoek.respond(leeg(405));
        return;
    }
    let Some(naam) = pad_in_pak(verzoek.url()) else {
        let _ = verzoek.respond(leeg(400));
        return;
    };
    match pak.lees(&naam) {
        Some(inhoud) => {
            let lengte = inhoud.len();
            let antwoord = tiny_http::Response::new(
                200.into(),
                koppen(inhoudstype(&naam)),
                std::io::Cursor::new(inhoud),
                Some(lengte),
                None,
            );
            let _ = verzoek.respond(antwoord);
        }
        None => {
            let _ = verzoek.respond(leeg(404));
        }
    }
}

fn bind() -> Result<tiny_http::Server, String> {
    for poort in VOORKEUR_POORTEN {
        if let Ok(server) = tiny_http::Server::http(("127.0.0.1", poort)) {
            return Ok(server);
        }
    }
    tiny_http::Server::http(("127.0.0.1", 0)).map_err(|e| e.to_string())
}

fn start(pak_pad: &Path) -> Result<u16, String> {
    let pak = Arc::new(Pak::open(pak_pad)?);
    let server = Arc::new(bind()?);
    let poort = server.server_addr().to_ip().map(|a| a.port()).ok_or("geen poort")?;
    for _ in 0..WERKERS {
        let server = server.clone();
        let pak = pak.clone();
        std::thread::spawn(move || {
            while let Ok(verzoek) = server.recv() {
                beantwoord(verzoek, &pak, poort);
            }
        });
    }
    Ok(poort)
}

/// Managed state: de poort zodra de server draait. Hij draait tot de app sluit.
#[derive(Default)]
pub struct JupyterOmgeving(Mutex<Option<u16>>);

/// Start de server bij het eerste Jupyter-blad en geeft de poort. De foutmelding
/// noemt het pad als de omgeving niet in deze build zit.
#[tauri::command]
pub fn jupyter_omgeving_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, JupyterOmgeving>,
) -> Result<u16, String> {
    let mut poort = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(p) = *poort {
        return Ok(p);
    }
    let map = app.path().resource_dir().map_err(|e| e.to_string())?;
    let p = start(&map.join(PAK_PAD))?;
    *poort = Some(p);
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alleen_de_eigen_hostnamen() {
        assert!(host_toegestaan(Some("blad-ab12.localhost:47631"), 47631));
        assert!(!host_toegestaan(Some("blad-ab12.localhost:47632"), 47631));
        assert!(!host_toegestaan(Some("127.0.0.1:47631"), 47631));
        assert!(!host_toegestaan(Some("localhost:47631"), 47631));
        assert!(!host_toegestaan(Some("blad-.localhost:47631"), 47631));
        assert!(!host_toegestaan(Some("blad-a.b.localhost:47631"), 47631));
        assert!(!host_toegestaan(Some("blad-a.evil.example:47631"), 47631));
        assert!(!host_toegestaan(None, 47631));
    }

    #[test]
    fn pad_uit_de_url() {
        assert_eq!(pad_in_pak("/lab/index.html?x=1").as_deref(), Some("lab/index.html"));
        assert_eq!(pad_in_pak("/lab/").as_deref(), Some("lab/index.html"));
        assert_eq!(pad_in_pak("/").as_deref(), Some("index.html"));
        assert_eq!(pad_in_pak("/extensions/%40jupyterlite/a.js").as_deref(), Some("extensions/@jupyterlite/a.js"));
        assert_eq!(pad_in_pak("/%zz"), None);
        assert_eq!(pad_in_pak("/%"), None);
    }

    #[test]
    fn het_pakbestand_lezen() {
        let map = std::env::temp_dir().join(format!("ocss-pak-{}", std::process::id()));
        std::fs::create_dir_all(&map).unwrap();
        let pad = map.join("proef.pak");
        let json = br#"{"a.txt":[0,5],"b/c.txt":[5,3]}"#;
        let mut inhoud = PAK_KOP.to_vec();
        inhoud.extend_from_slice(&(json.len() as u64).to_le_bytes());
        inhoud.extend_from_slice(json);
        inhoud.extend_from_slice(b"hallowas");
        std::fs::write(&pad, &inhoud).unwrap();

        let pak = Pak::open(&pad).unwrap();
        assert_eq!(pak.lees("a.txt").as_deref(), Some(&b"hallo"[..]));
        assert_eq!(pak.lees("b/c.txt").as_deref(), Some(&b"was"[..]));
        // Geen pad buiten het pakbestand: een naam is alleen een sleutel.
        assert_eq!(pak.lees("../proef.pak"), None);

        std::fs::write(&pad, b"iets anders dan een pak").unwrap();
        assert!(Pak::open(&pad).is_err());
        std::fs::remove_dir_all(&map).unwrap();
    }

    #[test]
    fn de_afscherming_staat_in_elk_antwoord() {
        assert!(CSP.contains("connect-src 'self' data: blob:;"));
        assert!(!CSP.contains("script-src 'self' 'unsafe-inline'"));
        assert!(CSP.contains("frame-ancestors "));
        assert!(!CSP.contains("https:"));
        let k = koppen("text/html");
        assert!(k.iter().any(|h| h.field.as_str().as_str() == "Content-Security-Policy" && h.value.as_str() == CSP));
    }
}
