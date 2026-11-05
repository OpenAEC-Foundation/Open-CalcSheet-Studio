import type { ReactNode } from "react";
import { openBuiten } from "./uitwerkingOpschonen";

/**
 * Een link naar een officiële bron: in de app opent hij in de systeembrowser, want het venster
 * van de app kan niet weg. De app haalt hier zelf niets op.
 */
export default function BronLink({ url, children, klasse = "rapport-link" }: { url: string; children: ReactNode; klasse?: string }) {
  return (
    <a
      className={klasse}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        void openBuiten(url);
      }}
    >
      {children}
    </a>
  );
}
