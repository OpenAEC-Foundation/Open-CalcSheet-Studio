import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { useZoom } from "../../hooks/useZoom";
import "./Editor.css";

const BASE_FONT_PX = 13;
const INVOEGSELS = [markdown(), EditorView.lineWrapping];

/** Werkruimte: de bron. Ongedaan maken loopt via de projectstore, net als bij een rekenblad (Editor.tsx). */
export default function MarkdownBron({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const zetMarkdown = useProjectStore((s) => s.zetMarkdown);
  const { ref, zoom } = useZoom();
  return (
    <div className="calc-editor" ref={ref} style={{ ["--cm-font-size" as string]: `${BASE_FONT_PX * zoom}px` }}>
      <CodeMirror
        value={ex.md?.tekst ?? ""}
        extensions={INVOEGSELS}
        placeholder={t("markdown.leeg")}
        onChange={(tekst) => zetMarkdown(ex.id, { ...(ex.md ?? { bestandsnaam: "" }), tekst })}
        basicSetup={{
          history: false,
          historyKeymap: false,
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
        }}
      />
    </div>
  );
}
