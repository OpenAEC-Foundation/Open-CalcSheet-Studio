# Jupyter-omgeving

Hier komt het pakbestand van de Jupyter-bladen: `omgeving.pak` met JupyterLite en
Pyodide, gemaakt door `node scripts/bouw-jupyter-omgeving.mjs`. Het staat niet in
git. `tauri build` maakt het zelf aan via `beforeBuildCommand`; zonder dit bestand
start de app gewoon en meldt een Jupyter-blad dat de omgeving ontbreekt.

Deze LEESMIJ staat er zodat `jupyter-omgeving/*` in `bundle.resources` ook zonder
pakbestand iets vindt.
