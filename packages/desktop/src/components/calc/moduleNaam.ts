import i18next from "i18next";
import { modulesPerTemplate } from "./projectTree";

/**
 * De naam van een module in de taal van de app. Een ingebouwde module heeft zijn naam in
 * de vertaalbestanden, een module uit de online bibliotheek draagt hem zelf mee. Zonder
 * vertaling het label uit de catalogus.
 */
export function moduleNaam(templateId: string): string | null {
  const info = modulesPerTemplate[templateId];
  if (!info) return null;
  if (info.namen) return (i18next.language?.startsWith("nl") ? info.namen.nl : info.namen.en) || info.namen.nl;
  return i18next.t(`werkruimte:catalogus.modules.${templateId}`, { defaultValue: info.label });
}

/** De naam van een groep in de catalogus, in de taal van de app. */
export function groepNaam(id: string, label: string): string {
  return i18next.t(`werkruimte:catalogus.groepen.${id}`, { defaultValue: label });
}
