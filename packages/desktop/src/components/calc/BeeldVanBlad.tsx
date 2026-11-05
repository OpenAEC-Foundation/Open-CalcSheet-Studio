import { designerVoor } from "./designerKeuze";

/** Het parametrische beeld van een bladtekst, als onderdeel dat de werkruimte lui kan laden. */
export default function BeeldVanBlad({ source }: { source: string }) {
  return designerVoor(source);
}
