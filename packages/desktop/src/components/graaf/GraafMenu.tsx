import { useEffect, useLayoutEffect, useRef, useState } from "react";

/*
 * Het rechtsklikmenu op het vlak: voor een node (of de keuze), een verbinding, een
 * groep, een tekst of een lege plek. Wat erin staat, bepaalt GraafBladWeergave.
 * Het sluit bij Escape, bij een klik ernaast en na een keuze, en blijft binnen het vlak.
 */

export type MenuItem = { tekst: string; toets?: string; actie: () => void; gevaar?: true; uit?: boolean } | "streep";

export function GraafMenu({ x, y, titel, items, onSluit }: {
  /** De plek in het vlak, in px vanaf de linkerbovenhoek. */
  x: number;
  y: number;
  titel?: string;
  items: MenuItem[];
  onSluit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState({ x, y });

  // Binnen het vlak houden, nu de maat bekend is.
  useLayoutEffect(() => {
    const el = ref.current;
    const ouder = el?.offsetParent as HTMLElement | null;
    if (!el || !ouder) return;
    setPlek({
      x: Math.max(4, Math.min(x, ouder.clientWidth - el.offsetWidth - 4)),
      y: Math.max(4, Math.min(y, ouder.clientHeight - el.offsetHeight - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const weg = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onSluit();
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSluit();
    };
    window.addEventListener("pointerdown", weg, true);
    window.addEventListener("keydown", toets, true);
    return () => {
      window.removeEventListener("pointerdown", weg, true);
      window.removeEventListener("keydown", toets, true);
    };
  }, [onSluit]);

  return (
    <div
      ref={ref}
      className="graaf-menu"
      role="menu"
      style={{ left: plek.x, top: plek.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {titel && <div className="graaf-menu-titel">{titel}</div>}
      {items.map((it, i) =>
        it === "streep" ? (
          <hr key={i} className="graaf-menu-streep" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.uit}
            className={`graaf-menu-item${it.gevaar ? " gevaar" : ""}`}
            onClick={() => {
              onSluit();
              it.actie();
            }}
          >
            <span>{it.tekst}</span>
            {it.toets && <kbd>{it.toets}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
