import { sprite, type Sprite } from "./ribbon/calcIcons";

/**
 * Een B2-icoon uit de Blueprint-sprites, voor panelen en balken buiten het
 * lint (daar geeft calcIcons.ts de markup). Kies het id uit de Blueprint.
 */
export default function Icoon({ id, uit = "standard", maat = 16 }: { id: string; uit?: Sprite; maat?: 16 | 24 }) {
  return (
    <svg className="oa-icon" width={maat} height={maat} aria-hidden="true">
      <use href={`${sprite(uit)}#i${maat}-${id}`} />
    </svg>
  );
}
