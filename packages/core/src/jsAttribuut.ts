/**
 * JSON voor in een html-attribuut, zonder `<` en `>`, ook niet in de tekst. Wat de
 * opschoning van de uitwerking in een attribuut verdacht vindt (`]>`, `-->`,
 * `</script`), kan er zo niet in voorkomen; `JSON.parse` leest het gewoon terug.
 */
export function jsonVoorAttribuut(waarde: unknown): string {
  return JSON.stringify(waarde).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}
