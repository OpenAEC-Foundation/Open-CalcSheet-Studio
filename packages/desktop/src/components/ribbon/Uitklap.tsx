import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Een paneel onder een lintknop: binnen het venster geplaatst, en dicht bij
 * een klik erbuiten of Escape. Een klik in een ander rekentaal-paneel (een menu
 * binnen een ingeklapte groep) telt als binnen.
 */
export function Uitklap({ anker, onSluit, className, children }: {
  anker: HTMLElement;
  onSluit: () => void;
  className: string;
  children: ReactNode;
}) {
  const paneel = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    // Het anker zelf heeft geen vak (display: contents); de knop erin wel.
    const r = (anker.querySelector("button") ?? anker).getBoundingClientRect();
    const breed = paneel.current?.offsetWidth ?? 0;
    const hoog = paneel.current?.offsetHeight ?? 0;
    // Past het er niet onder, zoals bij een knop onder in het paneel, dan erboven.
    const top = r.bottom + 2 + hoog > window.innerHeight ? Math.max(4, r.top - hoog - 2) : r.bottom + 2;
    setPlek({ left: Math.max(4, Math.min(r.left, window.innerWidth - breed - 4)), top });
  }, [anker]);

  useEffect(() => {
    const buiten = (e: MouseEvent) => {
      const doel = e.target as Element;
      if (paneel.current?.contains(doel) || anker.contains(doel)) return;
      if (doel.closest?.(".rekentaal-menu, .rekentaal-groep-paneel") && !paneel.current?.classList.contains("rekentaal-menu")) return;
      onSluit();
    };
    const toets = (e: KeyboardEvent) => { if (e.key === "Escape") onSluit(); };
    document.addEventListener("mousedown", buiten);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", buiten);
      document.removeEventListener("keydown", toets);
    };
  }, [anker, onSluit]);

  return (
    <div ref={paneel} className={className} role="menu" style={{ left: plek.left, top: plek.top }}>
      {children}
    </div>
  );
}
