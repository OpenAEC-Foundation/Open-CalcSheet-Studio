//! De koppeling met ERPNext: de tekst van één veld van een project ophalen.
//!
//! De frontend kan ERPNext niet zelf vragen: de webview houdt zo'n verzoek naar een ander
//! domein tegen (CORS). Daarom gaat het via Rust (`erpnext_project_veld`).
//!
//! - Het adres, de API-sleutel en de naam van het veld staan in de instellingen van de app
//!   (`src/tauri/erpnext.ts`).
//! - Het API-geheim staat alleen in de sleutelbos van het besturingssysteem, onder de
//!   dienst [`DIENST`]. Het gaat nooit terug naar de frontend en komt in geen foutmelding
//!   of log: het gaat alleen als header naar het ingestelde adres. Dat adres moet
//!   `https://` zijn; `http://localhost` mag, om te testen.
//!
//! De fouten hier zijn technisch en onvertaald: de leesbare zin eromheen komt uit de
//! vertalingen van de frontend.

use std::fmt::Write as _;
use std::time::Duration;

/// De dienst in de sleutelbos.
const DIENST: &str = "open-calcsheet-studio-erpnext";
/// De gebruiker bij die dienst: er is één geheim per gebruiker van de computer.
const GEBRUIKER: &str = "api-geheim";
/// Hoe lang een verzoek mag duren, verbinden en lezen samen.
const TIJDSLIMIET: Duration = Duration::from_secs(15);

/// Bewaar het API-geheim in de sleutelbos; een leeg geheim wist het.
#[tauri::command]
pub async fn erpnext_zet_geheim(geheim: String) -> Result<(), String> {
    los(move || bewaar_geheim(DIENST, &geheim)).await
}

/// Staat er een API-geheim in de sleutelbos? Het geheim zelf komt niet mee.
#[tauri::command]
pub async fn erpnext_heeft_geheim() -> bool {
    los(|| Ok(lees_geheim(DIENST)?.is_some())).await.unwrap_or(false)
}

/// De tekst van `data.{veld}` van project `project` in de ERPNext op `adres`; "" als het
/// veld leeg is of niet bestaat. Een fout van de server komt terug als "HTTP 404 …".
#[tauri::command]
pub async fn erpnext_project_veld(
    adres: String,
    sleutel: String,
    project: String,
    veld: String,
) -> Result<String, String> {
    los(move || vraag_veld(&adres, &sleutel, &project, &veld)).await
}

/// Doe `werk` op een eigen thread, buiten de hoofdthread: de sleutelbos kan om
/// toestemming vragen en een verzoek mag 15 s duren. Het venster blijft dan bruikbaar.
async fn los<T: Send + 'static>(
    werk: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(werk).await.map_err(|e| e.to_string())?
}

/// De ingang in de sleutelbos. `dienst` is altijd [`DIENST`], behalve in de proef.
fn sleutelbos(dienst: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(dienst, GEBRUIKER).map_err(|e| format!("keychain: {e}"))
}

/// Het geheim uit de sleutelbos, of `None` als er geen is.
fn lees_geheim(dienst: &str) -> Result<Option<String>, String> {
    match sleutelbos(dienst)?.get_password() {
        Ok(geheim) => Ok(Some(geheim)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain: {e}")),
    }
}

fn bewaar_geheim(dienst: &str, geheim: &str) -> Result<(), String> {
    let ingang = sleutelbos(dienst)?;
    let geheim = geheim.trim();
    if geheim.is_empty() {
        return match ingang.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keychain: {e}")),
        };
    }
    if !header_veilig(geheim) {
        return Err("the API secret contains characters that cannot be sent".to_string());
    }
    ingang.set_password(geheim).map_err(|e| format!("keychain: {e}"))
}

/// Mag deze tekst in de header? Een sleutel en een geheim van ERPNext zijn letters en
/// cijfers. Alles buiten zichtbare ASCII weigeren we hier, zodat ureq nooit een fout maakt
/// over een ongeldige header: die fout bevat de hele regel, en dus het geheim.
fn header_veilig(tekst: &str) -> bool {
    !tekst.is_empty() && tekst.bytes().all(|b| b.is_ascii_graphic())
}

fn vraag_veld(adres: &str, sleutel: &str, project: &str, veld: &str) -> Result<String, String> {
    // Eerst het adres: zonder een toegestaan adres wordt het geheim niet eens gelezen.
    let url = project_url(adres, project)?;
    let veld = veld.trim();
    if veld.is_empty() {
        return Err("no field name".to_string());
    }
    let sleutel = sleutel.trim();
    if !header_veilig(sleutel) {
        return Err("the API key is empty or contains characters that cannot be sent".to_string());
    }
    let geheim = lees_geheim(DIENST)?.ok_or("no API secret in the keychain")?;
    vraag(&url, sleutel, &geheim, veld)
}

/// Het verzoek zelf, met het geheim al uit de sleutelbos.
fn vraag(url: &str, sleutel: &str, geheim: &str, veld: &str) -> Result<String, String> {
    if !header_veilig(sleutel) {
        return Err("the API key is empty or contains characters that cannot be sent".to_string());
    }
    if !header_veilig(geheim) {
        return Err("the API secret contains characters that cannot be sent".to_string());
    }

    // Geen omleidingen volgen: de header met het geheim gaat alleen naar dit adres.
    let agent = ureq::AgentBuilder::new()
        .timeout(TIJDSLIMIET)
        .redirects(0)
        .user_agent(concat!("open-calcsheet-studio/", env!("CARGO_PKG_VERSION")))
        .build();
    let antwoord = agent
        .get(url)
        .set("Accept", "application/json")
        .set("Authorization", &format!("token {sleutel}:{geheim}"))
        .call();
    let antwoord = match antwoord {
        Ok(a) => a,
        Err(ureq::Error::Status(code, a)) => return Err(status_fout(code, a.status_text())),
        // Kan door header_veilig niet, maar deze fout noemt de header: nooit doorgeven.
        Err(ureq::Error::Transport(t)) if t.kind() == ureq::ErrorKind::BadHeader => {
            return Err("the API key or secret cannot be sent".to_string())
        }
        Err(ureq::Error::Transport(t)) => return Err(t.to_string()),
    };
    // Een omleiding (3xx) of een ander antwoord zonder inhoud telt als fout.
    if antwoord.status() != 200 {
        return Err(status_fout(antwoord.status(), antwoord.status_text()));
    }
    let tekst = antwoord.into_string().map_err(|e| format!("{url}: {e}"))?;
    veld_uit_antwoord(&tekst, veld)
}

fn status_fout(code: u16, tekst: &str) -> String {
    format!("HTTP {code} {tekst}").trim_end().to_string()
}

/// Het adres van het project `project` in ERPNext:
/// `{adres}/api/resource/Project/{project}`, met de projectnaam URL-gecodeerd.
///
/// Weigert een adres dat niet `https://` is of `http://localhost` (om te testen), en een
/// adres met een gebruikersnaam of wachtwoord erin. Een zoekvraag of anker in het adres
/// valt weg. De fout noemt het adres niet: daar kan een wachtwoord in staan.
pub fn project_url(adres: &str, project: &str) -> Result<String, String> {
    let fout = || "the ERPNext address must start with https:// (or http://localhost for testing)".to_string();
    let mut basis = url::Url::parse(adres.trim()).map_err(|_| fout())?;
    let toegestaan = match basis.scheme() {
        "https" => basis.host_str().is_some_and(|h| !h.is_empty()),
        "http" => basis.host_str() == Some("localhost"),
        _ => false,
    };
    if !toegestaan || !basis.username().is_empty() || basis.password().is_some() {
        return Err(fout());
    }
    basis.set_query(None);
    basis.set_fragment(None);

    let project = project.trim();
    if project.is_empty() || project == "." || project == ".." {
        return Err(format!("not a project name: {project:?}"));
    }
    Ok(format!(
        "{}/api/resource/Project/{}",
        basis.as_str().trim_end_matches('/'),
        padstuk(project)
    ))
}

/// Codeer `tekst` als één stuk van een pad: alles behalve letters, cijfers en `-._~`
/// wordt `%XX`, ook een `/`.
fn padstuk(tekst: &str) -> String {
    let mut uit = String::with_capacity(tekst.len());
    for b in tekst.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            uit.push(b as char);
        } else {
            let _ = write!(uit, "%{b:02X}");
        }
    }
    uit
}

/// De tekst van `data.{veld}` uit het antwoord van ERPNext op `GET /api/resource/…`.
///
/// Een ontbrekend of leeg veld geeft "". Een getal of ja/nee komt als tekst terug. Geen
/// JSON, of JSON zonder `data`, is een fout: dan antwoordde iets anders dan ERPNext, zoals
/// een inlogpagina.
pub fn veld_uit_antwoord(json: &str, veld: &str) -> Result<String, String> {
    let waarde: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("the answer is not JSON: {e}"))?;
    let data = waarde
        .get("data")
        .and_then(|d| d.as_object())
        .ok_or("the answer has no data")?;
    Ok(match data.get(veld.trim()) {
        None | Some(serde_json::Value::Null) => String::new(),
        Some(serde_json::Value::String(s)) => s.trim().to_string(),
        Some(ander) => ander.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn erpnext_project_url_codeert_de_projectnaam() {
        assert_eq!(
            project_url("https://erp.voorbeeld.nl", "PRJ-0001/A").unwrap(),
            "https://erp.voorbeeld.nl/api/resource/Project/PRJ-0001%2FA"
        );
    }

    #[test]
    fn erpnext_project_url_weigert_ander_schema() {
        assert!(project_url("ftp://x", "PRJ-0001").is_err());
    }

    #[test]
    fn erpnext_veld_uit_antwoord_geeft_de_tekst() {
        assert_eq!(
            veld_uit_antwoord(r#"{"data":{"custom_location":"52.09, 5.12"}}"#, "custom_location").unwrap(),
            "52.09, 5.12"
        );
    }

    #[test]
    fn erpnext_veld_uit_antwoord_ontbrekend_veld_is_leeg() {
        assert_eq!(veld_uit_antwoord(r#"{"data":{"name":"PRJ-0001"}}"#, "custom_location").unwrap(), "");
    }

    #[test]
    fn erpnext_veld_uit_antwoord_zonder_json_is_een_fout() {
        assert!(veld_uit_antwoord("<html>Login</html>", "custom_location").is_err());
    }

    #[test]
    fn erpnext_project_url_localhost_om_te_testen() {
        assert_eq!(
            project_url("http://localhost:8000/", "P 1&2").unwrap(),
            "http://localhost:8000/api/resource/Project/P%201%262"
        );
        assert_eq!(
            project_url("http://LOCALHOST", "P").unwrap(),
            "http://localhost/api/resource/Project/P"
        );
    }

    #[test]
    fn erpnext_project_url_weigert_onveilige_adressen() {
        for adres in [
            "http://erp.voorbeeld.nl",
            "http://localhost.voorbeeld.nl",
            "http://localhost:80@erp.voorbeeld.nl",
            "http://127.0.0.1:8000",
            "https://gebruiker:wachtwoord@erp.voorbeeld.nl",
            "erp.voorbeeld.nl",
            "",
        ] {
            assert!(project_url(adres, "PRJ-0001").is_err(), "{adres}");
        }
    }

    #[test]
    fn erpnext_project_url_fout_noemt_het_adres_niet() {
        let fout = project_url("https://gebruiker:wachtwoord@erp.voorbeeld.nl", "P").unwrap_err();
        assert!(!fout.contains("wachtwoord"), "{fout}");
    }

    #[test]
    fn erpnext_project_url_laat_zoekvraag_weg_en_houdt_het_pad() {
        assert_eq!(
            project_url("https://erp.voorbeeld.nl/?x=1#a", "P").unwrap(),
            "https://erp.voorbeeld.nl/api/resource/Project/P"
        );
        assert_eq!(
            project_url("https://voorbeeld.nl/erp/", "P").unwrap(),
            "https://voorbeeld.nl/erp/api/resource/Project/P"
        );
    }

    #[test]
    fn erpnext_project_url_weigert_lege_projectnaam() {
        for project in ["", "  ", ".", ".."] {
            assert!(project_url("https://erp.voorbeeld.nl", project).is_err(), "{project:?}");
        }
    }

    #[test]
    fn erpnext_padstuk_codeert_alles_behalve_ongereserveerd() {
        assert_eq!(padstuk("Ab-1._~"), "Ab-1._~");
        assert_eq!(padstuk("a/b?c#d%e"), "a%2Fb%3Fc%23d%25e");
        assert_eq!(padstuk("é"), "%C3%A9");
    }

    #[test]
    fn erpnext_veld_uit_antwoord_leeg_getal_en_zonder_data() {
        assert_eq!(veld_uit_antwoord(r#"{"data":{"custom_location":null}}"#, "custom_location").unwrap(), "");
        assert_eq!(veld_uit_antwoord(r#"{"data":{"custom_location":"  "}}"#, "custom_location").unwrap(), "");
        assert_eq!(veld_uit_antwoord(r#"{"data":{"n":12}}"#, "n").unwrap(), "12");
        assert!(veld_uit_antwoord(r#"{"message":"Not found"}"#, "custom_location").is_err());
        assert!(veld_uit_antwoord(r#"{"data":[]}"#, "custom_location").is_err());
    }

    /// Een kleine server op localhost die één verzoek beantwoordt; geeft het adres en de
    /// ontvangen Authorization-header terug.
    fn proefserver(
        status: u16,
        kop: Option<(&'static str, &'static str)>,
        inhoud: &'static str,
    ) -> (String, std::thread::JoinHandle<Option<String>>) {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let poort = server.server_addr().to_ip().unwrap().port();
        let draad = std::thread::spawn(move || {
            let verzoek = server.recv_timeout(Duration::from_secs(10)).ok()??;
            let auth = verzoek
                .headers()
                .iter()
                .find(|h| h.field.equiv("Authorization"))
                .map(|h| h.value.to_string());
            let mut antwoord = tiny_http::Response::from_string(inhoud).with_status_code(status);
            if let Some((naam, waarde)) = kop {
                antwoord.add_header(tiny_http::Header::from_bytes(naam, waarde).unwrap());
            }
            let _ = verzoek.respond(antwoord);
            auth
        });
        (format!("http://localhost:{poort}"), draad)
    }

    #[test]
    fn erpnext_vraag_stuurt_de_sleutel_en_leest_het_veld() {
        let (adres, draad) = proefserver(200, None, r#"{"data":{"custom_location":"52.09, 5.12"}}"#);
        let url = project_url(&adres, "PRJ-0001/A").unwrap();
        assert_eq!(vraag(&url, "sleutel1", "geheim2", "custom_location").unwrap(), "52.09, 5.12");
        assert_eq!(draad.join().unwrap().as_deref(), Some("token sleutel1:geheim2"));
    }

    #[test]
    fn erpnext_vraag_meldt_de_http_status_zonder_geheim() {
        let (adres, draad) = proefserver(403, None, r#"{"exc_type":"AuthenticationError"}"#);
        let url = project_url(&adres, "P").unwrap();
        let fout = vraag(&url, "sleutel1", "geheim2", "custom_location").unwrap_err();
        assert!(fout.starts_with("HTTP 403"), "{fout}");
        assert!(!fout.contains("geheim2"), "{fout}");
        draad.join().unwrap();
    }

    #[test]
    fn erpnext_vraag_volgt_geen_omleiding() {
        let (adres, draad) = proefserver(302, Some(("Location", "https://elders.voorbeeld.nl/")), "");
        let url = project_url(&adres, "P").unwrap();
        let fout = vraag(&url, "sleutel1", "geheim2", "custom_location").unwrap_err();
        assert!(fout.starts_with("HTTP 302"), "{fout}");
        draad.join().unwrap();
    }

    #[test]
    fn erpnext_vraag_weigert_een_header_met_regelovergang() {
        // Er gaat niets de deur uit: de toets komt vóór het verzoek.
        let geheim = "g\r\nX-Ander: 1";
        let fout = vraag("http://localhost:9/api/resource/Project/P", "s", geheim, "v").unwrap_err();
        assert!(!fout.contains("X-Ander"), "{fout}");
    }

    /// Bewaart, leest en wist een geheim in de echte sleutelbos, onder een eigen proefdienst
    /// (niet die van de app). Niet in de gewone reeks: op een server zonder sleutelbos of
    /// met een toestemmingsvraag zou hij falen of wachten. Draaien met `--ignored`.
    #[test]
    #[ignore]
    fn erpnext_sleutelbos_bewaart_echt() {
        let proef = "open-calcsheet-studio-erpnext-proef";
        bewaar_geheim(proef, " proefgeheim ").unwrap();
        assert_eq!(lees_geheim(proef).unwrap().as_deref(), Some("proefgeheim"));
        bewaar_geheim(proef, "").unwrap();
        assert_eq!(lees_geheim(proef).unwrap(), None);
        bewaar_geheim(proef, "").unwrap();
    }

    #[test]
    fn erpnext_header_veilig_weigert_regelovergang_en_leeg() {
        assert!(header_veilig("abc123DEF"));
        assert!(!header_veilig(""));
        assert!(!header_veilig("abc\r\nX-Ander: 1"));
        assert!(!header_veilig("a b"));
        assert!(!header_veilig("é"));
    }
}
