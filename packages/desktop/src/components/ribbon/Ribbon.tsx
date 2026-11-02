import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import RibbonTab from "./RibbonTab";
import CalcTab from "./CalcTab";
import IfcTab from "./IfcTab";
import CalcPadTab from "./CalcPadTab";
import TekenenTab from "../tekenen/TekenenTab";
import { toonTekenen, verbergTekenen } from "../tekenen/tekenStore";
import { useEditorViewStore } from "../../store/editorViewStore";
import { vraagCode } from "../../store/codeVerzoek";
import "./Ribbon.css";

interface RibbonProps {
  onFileTabClick?: () => void;
  /** Opent de instellingen, eventueel op een bepaalde tab ("about"). */
  onSettingsClick?: (tab?: string) => void;
  onHelpClick?: () => void;
  onWelkomClick?: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

const TABS = ["calc", "calcpad", "tekenen", "ifc"] as const;
type TabId = (typeof TABS)[number];

export default function Ribbon({ onFileTabClick, onSettingsClick, onHelpClick, onWelkomClick, onViewChange }: RibbonProps) {
  const { t, i18n } = useTranslation("ribbon");
  // De tab CalcPAD staat er altijd; zijn knoppen voegen in op de cursor in de
  // editor. Wie de tab kiest, wil code schrijven: staat die niet in beeld, dan
  // zet de werkruimte hem erbij (store/codeVerzoek.ts).
  const tabs: readonly TabId[] = TABS;
  const [activeTab, setActiveTab] = useState<TabId>("calc");
  const [prevTab, setPrevTab] = useState<TabId | null>(null);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const tabsRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLDivElement>(null);

  const updateHighlight = useCallback(() => {
    const tabsEl = tabsRef.current;
    const borderEl = borderRef.current;
    const gapEl = gapRef.current;
    if (!tabsEl || !borderEl || !gapEl) return;

    const activeEl = tabsEl.querySelector(".ribbon-tab.active") as HTMLElement | null;
    if (!activeEl) {
      borderEl.style.opacity = "0";
      gapEl.style.opacity = "0";
      return;
    }

    const tabsRect = tabsEl.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const left = activeRect.left - tabsRect.left;
    const top = activeRect.top - tabsRect.top;
    const width = activeRect.width;
    const height = activeRect.height;

    borderEl.style.opacity = "1";
    borderEl.style.left = `${left}px`;
    borderEl.style.top = `${top}px`;
    borderEl.style.width = `${width}px`;
    borderEl.style.height = `${height}px`;

    gapEl.style.opacity = "1";
    gapEl.style.left = `${left + 1}px`;
    gapEl.style.width = `${width - 2}px`;
  }, []);

  const switchTab = useCallback((newTab: TabId) => {
    if (newTab === activeTab) return;
    const oldIndex = tabs.indexOf(activeTab);
    const newIndex = tabs.indexOf(newTab);
    setDirection(newIndex > oldIndex ? "right" : "left");
    setPrevTab(activeTab);
    setActiveTab(newTab);
    setAnimating(true);

    // IFC tab → switch main view to IFC code panel
    onViewChange(newTab === "ifc" ? "ifc" : "default");
    if (newTab === "calcpad" && !useEditorViewStore.getState().view) vraagCode();
    // Tekenen: de tekeneditor komt over de uitwerking; weg van de tab gaat hij uit beeld.
    if (newTab === "tekenen") toonTekenen();
    else if (activeTab === "tekenen") verbergTekenen();
  }, [activeTab, onViewChange, tabs]);

  useEffect(() => {
    updateHighlight();
    requestAnimationFrame(updateHighlight);
  }, [activeTab, i18n.language, updateHighlight]);

  useEffect(() => {
    window.addEventListener("resize", updateHighlight);
    // Opnieuw meten zodra de lettertypen er zijn: daarvoor zijn de tabs smaller.
    void document.fonts?.ready.then(updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [updateHighlight]);

  useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => {
      setAnimating(false);
      setPrevTab(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [animating]);

  const renderContent = (tab: TabId) => {
    switch (tab) {
      case "calc": return <CalcTab onSettingsClick={onSettingsClick} onHelpClick={onHelpClick} onWelkomClick={onWelkomClick} />;
      case "ifc": return <IfcTab />;
      case "calcpad": return <CalcPadTab />;
      case "tekenen": return <TekenenTab />;
    }
  };

  return (
    <div className="ribbon-container">
      <div className="ribbon-tabs" ref={tabsRef}>
        <RibbonTab label={t("tabs.file")} isFileTab onClick={() => onFileTabClick?.()} />
        {tabs.map((tab) => (
          <RibbonTab
            key={tab}
            label={t(`tabs.${tab}`, tab === "calcpad" ? "CalcPAD" : tab)}
            isActive={activeTab === tab}
            onClick={() => switchTab(tab)}
          />
        ))}
        <div className="ribbon-tab-border" ref={borderRef} />
        <div className="ribbon-tab-gap" ref={gapRef} />
      </div>

      <div
        className="ribbon-content-wrapper"
        // Een lint dat breder is dan het venster schuift met het muiswiel.
        onWheel={(e) => {
          const paneel = (e.target as HTMLElement).closest(".ribbon-content-panel");
          if (paneel && paneel.scrollWidth > paneel.clientWidth && e.deltaY !== 0) {
            paneel.scrollLeft += e.deltaY;
          }
        }}
      >
        {animating && prevTab && (
          <div
            className={`ribbon-content-panel ribbon-panel-exit-${direction}`}
            key={`prev-${prevTab}`}
          >
            {renderContent(prevTab)}
          </div>
        )}
        <div
          className={`ribbon-content-panel${animating ? ` ribbon-panel-enter-${direction}` : ""}`}
          key={`active-${activeTab}`}
        >
          {renderContent(activeTab)}
        </div>
      </div>
    </div>
  );
}
