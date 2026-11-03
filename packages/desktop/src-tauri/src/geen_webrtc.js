// Haalt WebRTC weg, in elk document van de app en vóór elk ander script (lib.rs, `geen_webrtc`).
// Dus ook in een frame dat een `@js`-blok zelf maakt: dat heeft een eigen, nieuwe omgeving.
// Staat hier met een eigen bestand, zodat scripts/check-js-blok.mjs het kan draaien.
for (const naam of Object.getOwnPropertyNames(window)) {
  if (/^(webkit)?RTC/.test(naam)) delete window[naam];
}
