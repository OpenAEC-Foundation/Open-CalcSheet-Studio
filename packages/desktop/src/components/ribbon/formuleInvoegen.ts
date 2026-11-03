import { useProjectStore } from "../../store/projectStore";
import { useModuleKiezer } from "../../store/moduleKiezer";
import { metEditor, vraagCode } from "../../store/codeVerzoek";
import { isPdfBlad } from "../../store/pdfBijlage";
import { codeVan, type Formule } from "./formules";
import { voegIn } from "./invoegen";

/** Zelfde soort blad als "Leeg blad" in het lint: geen module erachter. */
const LEEG_BLAD = "leeg";

/** Een blad waarin code kan: geen projectgegevens, rapport of PDF-blad. */
export function openRekenblad() {
  const s = useProjectStore.getState();
  const blad = s.exemplaren.find((e) => e.id === s.activeId);
  return blad && !isPdfBlad(blad) ? blad : null;
}

/**
 * Een nieuw blad met dit fragment. De kop van een Library-voorbeeld wordt de
 * titel van het blad; het blad staat meteen in de naamgeefstand, net als een
 * module, en in beeld, ook vanuit het afdrukvoorbeeld of de IFC-weergave.
 */
export function nieuwBladMetFormule(f: Formule, taal: string | undefined): void {
  const naam = taal?.startsWith("en") ? f.naam.en : f.naam.nl;
  const code = codeVan(f, taal);
  const tekst = code.startsWith("## ") ? `"${code.slice(3)}` : `"${naam}\n\n${code}`;
  const id = useProjectStore.getState().voegToe(LEEG_BLAD, naam, `${tekst}\n`);
  useModuleKiezer.setState({ nieuwId: id });
  vraagCode();
}

/**
 * Op de cursor in het open blad; is er geen blad open, dan begint het een nieuw
 * blad. De cursor komt op een nieuwe regel eronder: klaar voor het volgende
 * fragment, en de editor blijft links staan, ook na een lange slotregel. Is er
 * nog nergens in de code geklikt, dan staat de cursor boven de titel van het
 * blad; dan komt het fragment achteraan.
 */
export function voegFormuleIn(f: Formule, taal: string | undefined): void {
  if (!openRekenblad()) {
    nieuwBladMetFormule(f, taal);
    return;
  }
  const tekst = `${codeVan(f, taal)}\n`;
  metEditor((view) => {
    const { doc, selection } = view.state;
    if (selection.main.empty && selection.main.head === 0 && doc.length > 0) {
      view.dispatch({ selection: { anchor: doc.length } });
    }
    voegIn(view, { glyph: "ƒ", tekst, regel: true });
  });
}
