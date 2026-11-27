/**
 * De teksthoofdstukken van het rapport als modules: Inleiding, Projectgegevens en
 * Constructie. Gewone rekentekst: de keuzes (`@select`) zijn de invoer, de tekst eronder is
 * wat op papier komt, en alles is in de tab Code aan te passen.
 *
 * De keuzes staan achter `#pre`: op het scherm bij de invoer, niet op papier. Een naam
 * tussen apostroffen in een tekstregel ('project_naam') is de waarde uit de projectgegevens.
 * `adviseur` komt uit Projectgegevens, dat hem met `#global` aan elk blad geeft.
 *
 * De teksten zijn de meegeleverde standaardteksten van het rapport
 * (i18n/locales/nl/rapportteksten.json): neutraal, zonder namen van bureaus of producten.
 * Een kop van het eerste niveau (`# Kop`) is in het rapport een genummerde paragraaf
 * (rapport/uitBladen.ts).
 */

export const rapportInleiding = `"Inleiding
#pre
@select omvang "Omvang van dit rapport"
  De hoofdberekening = 1
  Alleen de uitgangspunten = 2
@end
#post
'Ten behoeve van het project 'project_naam' brengt 'adviseur' op verzoek van de opdrachtgever in dit rapport een constructieadvies uit.
'Het advies is gebaseerd op de verstrekte gegevens.
#if omvang ≡ 1
'Dit rapport omvat de hoofdberekening van de constructie.
'Voor de detailengineering dienen nog aanvullende berekeningen door derden te worden uitgevoerd, die door 'adviseur' worden gecontroleerd:
'- Tekeningen en berekeningen systeemvloeren;
'- Tekeningen en berekeningen staalconstructie;
'- Sondering en funderingsadvies.
#else
'Dit rapport omvat de uitgangspunten van de constructie.
#end if
`;

export const rapportProjectgegevens = `"Projectgegevens
#pre
'De naam van het bureau zoals hij in de teksten van het rapport staat. Elk blad kent hem als adviseur.
#global adviseur = "het adviesbureau"
#post
# Projectomschrijving
#pre
@select soort "Soort project"
  Aanbouw = 1
  Dakopbouw = 2
  Nieuwbouw woning = 3
  Verbouwing = 4
@end
#post
#if soort ≡ 1
'Het project omvat het realiseren van een aanbouw.
#else if soort ≡ 2
'Het project omvat het realiseren van een dakopbouw.
#else if soort ≡ 3
'Het project omvat het realiseren van een woonhuis.
#else
'Het project omvat de verbouwing van een bestaand pand.
#end if
'Project: 'project_nummer' 'project_naam'
'Locatie: 'locatie'
'Opdrachtgever: 'opdrachtgever'
# Rol binnen het project en bereik rapport
#pre
@select opdracht "Opdracht"
  Constructieadvies = 1
  Toetsing = 2
@end
#post
#if opdracht ≡ 1
''adviseur' heeft opdracht voor het constructieadvies voor dit project.
#else
''adviseur' heeft opdracht voor het toetsen van de constructie van dit project.
#end if
'Constructeur: 'constructeur'
`;

export const rapportConstructie = `"Constructie
#pre
@select werk "Soort werk"
  Verbouw van een bestaand gebouw = 1
  Nieuwbouw = 2
@end
#post
# Toelichting constructie
#if werk ≡ 1
## Bestaande situatie
#pre
@select verticaal "Verticale belastingafdracht"
  Houten balklagen op metselwerk = 1
  Gordingenkap en houten balklagen = 2
  Betonvloeren op dragende wanden = 3
@end
@select stabiliteit "Stabiliteit"
  Gemetselde bouwmuren = 1
  Stabiliteitswanden en schijfwerking = 2
@end
@select fundatie "Fundatie"
  Onbekend, vermoedelijk op staal = 1
  Op staal = 2
  Op palen = 3
@end
@select beoordeling "Beoordeling bestaande constructie"
  Geen aanleiding tot twijfel = 1
  Beoordelen in het werk = 2
@end
#post
'<b>Verticale belastingafdracht</b>
#if verticaal ≡ 1
'De vloeren bestaan uit houten balklagen. Deze dragen via de gemetselde bouwmuren af naar de fundering.
#else if verticaal ≡ 2
'Het dak bestaat uit een gordingenkap. De vloeren bestaan uit houten balklagen. Deze dragen via de gemetselde bouwmuren en een dragende tussenwand af naar de fundering.
#else
'De vloeren bestaan uit betonvloeren. Deze dragen via de dragende wanden af naar de fundering.
#end if
'<b>Stabiliteit</b>
#if stabiliteit ≡ 1
'De stabiliteit wordt verzorgd door de gemetselde bouwmuren.
#else
'De stabiliteit wordt verzorgd door de stabiliteitswanden, in combinatie met de schijfwerking van de vloeren.
#end if
'<b>Fundatie</b>
#if fundatie ≡ 1
'Er zijn geen archiefgegevens bekend. Vermoedelijk is het gebouw op staal gefundeerd.
#else if fundatie ≡ 2
'Het gebouw is volgens de archiefgegevens op staal gefundeerd.
#else
'Het gebouw is volgens de archiefgegevens op palen gefundeerd.
#end if
'<b>Beoordeling bestaande constructie</b>
#if beoordeling ≡ 1
'Er is geen aanleiding om te twijfelen aan de bouwkwaliteit van de bestaande constructie.
#else
'De staat van de bestaande constructie is niet bekend. Deze wordt voor aanvang van de werkzaamheden in het werk beoordeeld.
#end if
## Wijziging
#pre
@select wijziging "Wijziging"
  Doorbraak in dragende wand = 1
  Aanbouw met houten balklaag = 2
@end
#post
#if wijziging ≡ 1
'Er wordt een doorbraak gemaakt in een dragende wand met een stalen portaal.
'De stabiliteit wordt verzorgd door het resterende deel van de wand.
'De verticale belastingafdracht naar de fundering gaat via de kolommen en de onderligger naar de bestaande fundering.
#else
'De aanbouw wordt gerealiseerd met een houten balklaag als dak, die via dragende wanden afdraagt naar een nieuwe fundering op staal.
#end if
#else
## Constructieprincipe
'Beschrijf hier de draagconstructie: de verticale belastingafdracht, de stabiliteit en de fundering.
#end if
## Belendingen
'De constructieve invloed van belendingen is in deze berekening niet beschouwd.
# Aandachtspunten bij uitvoering
#if werk ≡ 1
'<b>Bestaande situatie</b>
'- Maatvoering is gebaseerd op archiefstukken en/of de tekening van de architect.
'- Maatvoering moet in het werk worden gecontroleerd.
'<b>Verbouw, renovatie</b>
'- Bij het maken van nieuwe openingen in bestaand metselwerk de wand en de omliggende constructie voldoende stempelen.
'- Dragende onderdelen pas verwijderen als de nieuwe constructie is aangebracht of de belasting tijdelijk is opgevangen.
#else
#pre
@select fundering "Fundering"
  Op staal = 1
  Op palen = 2
@end
#post
'<b>Nieuwbouw</b>
#if fundering ≡ 1
'- Fundering op staal: de draagkrachtige laag vaststellen tijdens het ontgraven.
'- Wapening voor het storten laten controleren.
#else
'- Kalenderstaten en paalafwijkingen naar de constructeur sturen.
'- Wapeningscontroles van de fundering en van alle vloerstorts.
#end if
#end if
`;
