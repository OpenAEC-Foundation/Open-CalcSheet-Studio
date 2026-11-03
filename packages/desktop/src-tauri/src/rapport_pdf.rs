//! Het rapport als PDF wegschrijven, zonder de printdialoog van het systeem.
//!
//! De frontend zet de vellen klaar (`src/components/rapport/afdruk/drukvellen.ts`)
//! en roept daarna `rapport_pdf_schrijven` aan met de gekozen bestandsnaam. WebView2
//! drukt dan de pagina af zoals de printdialoog dat doet: dezelfde `@media print`,
//! dezelfde vellen, maar met vaste instellingen en naar een bestand.
//!
//! Alleen op Windows. Op de andere platformen zegt `rapport_pdf_beschikbaar` nee en
//! blijft de frontend bij `window.print()`; die doet dat ook als het schrijven mislukt.
//! De fouten hier zijn technisch en onvertaald: de leesbare zin eromheen komt uit de
//! vertalingen van de frontend.

/// Kan deze build het rapport zelf wegschrijven?
#[tauri::command]
pub fn rapport_pdf_beschikbaar() -> bool {
    cfg!(windows)
}

/// Schrijf de pagina van `venster` als PDF naar `pad`. Geeft het aantal bytes terug.
///
/// Asynchroon, en dat moet: `with_webview` draait op de hoofdthread en WebView2
/// meldt zich daar ook terug. Een synchrone opdracht zou die thread vasthouden.
#[cfg(windows)]
#[tauri::command]
pub async fn rapport_pdf_schrijven(venster: tauri::WebviewWindow, pad: String) -> Result<u64, String> {
    let doel = std::path::Path::new(&pad);
    if !doel.is_absolute() {
        return Err(format!("not an absolute path: {pad}"));
    }
    if !doel.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
        return Err(format!("not a PDF file name: {pad}"));
    }

    let (antwoord, mut uitkomst) = tauri::async_runtime::channel::<Result<(), String>>(1);
    let bestand = pad.clone();
    venster
        .with_webview(move |webview| {
            let terug = antwoord.clone();
            let klaar = move |r| {
                let _ = terug.try_send(r);
            };
            // SAFETY: deze closure draait op de hoofdthread, de thread van de webview.
            if let Err(fout) = unsafe { webview2::print_to_pdf(&webview, &bestand, klaar) } {
                let _ = antwoord.try_send(Err(fout.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;

    // Zonder antwoord is de afhandeling weggegooid: de webview is er niet meer.
    uitkomst.recv().await.ok_or("no answer from the webview")??;
    controleer_pdf(doel)
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn rapport_pdf_schrijven(pad: String) -> Result<u64, String> {
    Err(format!("{pad}: only available on Windows"))
}

/// Staat er echt een PDF? Een afdruk zonder inhoud mag niet als gelukt gelden.
#[cfg(windows)]
fn controleer_pdf(pad: &std::path::Path) -> Result<u64, String> {
    use std::io::Read;
    let mut begin = [0u8; 5];
    let mut bestand = std::fs::File::open(pad).map_err(|e| format!("{}: {e}", pad.display()))?;
    bestand.read_exact(&mut begin).map_err(|e| format!("{}: {e}", pad.display()))?;
    if &begin != b"%PDF-" {
        return Err(format!("{} is not a PDF", pad.display()));
    }
    bestand.metadata().map(|m| m.len()).map_err(|e| format!("{}: {e}", pad.display()))
}

#[cfg(windows)]
mod webview2 {
    use tauri::webview::PlatformWebview;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    /// A4 in inch, de maat die WebView2 wil. De vellen vullen dit vel precies
    /// (`.av-pagina`, `@page rapportvel`), dus de marges zijn nul.
    const A4_BREEDTE: f64 = 210.0 / 25.4;
    const A4_HOOGTE: f64 = 297.0 / 25.4;

    /// Start de afdruk. `klaar` volgt later op dezelfde thread; een fout hier betekent
    /// dat de afdruk niet is begonnen en `klaar` niet komt.
    ///
    /// # Safety
    /// Aanroepen op de thread van de webview.
    pub unsafe fn print_to_pdf(
        webview: &PlatformWebview,
        pad: &str,
        klaar: impl FnOnce(Result<(), String>) + 'static,
    ) -> windows::core::Result<()> {
        let kern = webview.controller().CoreWebView2()?.cast::<ICoreWebView2_7>()?;
        let instellingen = webview.environment().cast::<ICoreWebView2Environment6>()?.CreatePrintSettings()?;
        instellingen.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
        instellingen.SetPageWidth(A4_BREEDTE)?;
        instellingen.SetPageHeight(A4_HOOGTE)?;
        instellingen.SetMarginTop(0.0)?;
        instellingen.SetMarginBottom(0.0)?;
        instellingen.SetMarginLeft(0.0)?;
        instellingen.SetMarginRight(0.0)?;
        instellingen.SetShouldPrintBackgrounds(true)?;
        instellingen.SetShouldPrintHeaderAndFooter(false)?;

        let afgehandeld = PrintToPdfCompletedHandler::create(Box::new(move |fout, gelukt| {
            klaar(match fout {
                Ok(()) if gelukt => Ok(()),
                // WebView2 meldt een bestand dat niet te schrijven is met "niet gelukt" en geen foutcode.
                Ok(()) => Err("PrintToPdf reported failure".to_string()),
                Err(e) => Err(e.to_string()),
            });
            Ok(())
        }));
        kern.PrintToPdf(&HSTRING::from(pad), &instellingen, &afgehandeld)
    }
}
