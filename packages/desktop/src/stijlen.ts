/**
 * Alle stijlen van de werkruimte, op de volgorde waarin ze elkaar overschrijven.
 *
 * De schermen laden pas als ze in beeld komen, maar hun stijlen niet: laadt een stijl
 * later, dan komt hij na themes.css en App.css in de cascade en wint hij van regels die
 * nu juist winnen. Daarom staan ze hier bij elkaar, vóór de app. Een onderdeel importeert
 * zijn eigen stijl ook gewoon zelf; dat blijft zo. Een nieuw onderdeel hoeft hier niet
 * bij, tenzij zijn stijl onder themes.css of App.css moet vallen.
 */
import "./openaec/openaec-fonts.css";
import "./openaec/openaec-tokens.css";
import "./components/TitleBar.css";
import "./components/Modal.css";
import "./components/settings/SettingsDialog.css";
import "./components/ribbon/FormuleVenster.css";
import "./components/ribbon/PdfTab.css";
import "./components/tekenen/Tekenen.css";
import "./components/ribbon/Ribbon.css";
import "./components/DocumentBar.css";
import "./components/StatusBar.css";
import "./components/backstage/Backstage.css";
import "./components/ThemedSelect.css";
import "./components/settings/McpTab.css";
import "./components/calc/HelpPanel.css";
import "./components/Welkom.css";
import "./components/calc/Editor.css";
import "katex/dist/katex.min.css";
import "./components/calc/Preview.css";
import "./components/calc/SplitPane.css";
import "./components/calc/LibrarySectie.css";
import "./components/rapport/gewichten/GewichtenVenster.css";
import "./components/calc/PdfBladWeergave.css";
import "./components/calc/SpreadsheetBladWeergave.css";
import "./components/calc/MarkdownBladWeergave.css";
import "./components/graaf/GraafBlad.css";
import "./components/calc/Tekenblad.css";
import "./components/calc/JupyterBlad.css";
import "./components/calc/ProjectBrowser.css";
import "./components/calc/BladVersie.css";
import "./components/calc/VoetplaatDesigner.css";
import "./components/calc/DoorsnedeDesigner.css";
import "leaflet/dist/leaflet.css";
import "./components/calc/WindAreaMap.css";
import "./components/calc/ProjectGegevensPanel.css";
import "./components/rapport/RapportPanel.css";
import "./components/calc/CanvasBladWeergave.css";
import "./components/calc/PrintDocument.css";
import "./components/rapport/afdruk/RapportAfdruk.css";
import "./components/calc/AfdrukVoorbeeld.css";
import "./components/calc/ModuleKiezer.css";
import "./components/calc/IfcViewerPanel.css";
import "./components/FeedbackDialog.css";
import "./themes.css";
import "./App.css";
