#!/usr/bin/env bash
# Start de app-container (docker/app.Dockerfile): één programma, schermvullend, in een
# minimale grafische sessie, gestreamd op poort 3000.
#
#   Xvfb :1                     het scherm, zonder GPU (OCSS_SCHERM, standaard 1600x900)
#   matchbox-window-manager     zet elk venster schermvullend, zonder titelbalk
#   x11vnc op 127.0.0.1:5900    het scherm als VNC
#   websockify op 127.0.0.1:6080 VNC als websocket, met noVNC als webpagina
#   poort.mjs op 0.0.0.0:3000   de stroom en GET /gezond
#   socat op 0.0.0.0:3001       de MCP-server en REST-API van de app (die zelf op
#                               127.0.0.1:3879 luistert), alleen voor het interne netwerk
#   open-calcsheet-studio       de app; stopt hij, dan start hij opnieuw
#
# Bestanden van de gebruiker staan in /openaec, de instellingen in /config.
set -euo pipefail

export HOME=/config
export XDG_CONFIG_HOME=/config/config XDG_DATA_HOME=/config/data XDG_CACHE_HOME=/config/cache
export XDG_RUNTIME_DIR="/tmp/runtime-$(id -u)"
export DISPLAY=:1
# Geen GPU en geen user namespaces in de container: WebKitGTK tekent in software.
export WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

# De dialogen beginnen in /openaec.
cat >"$XDG_CONFIG_HOME/user-dirs.dirs" <<'EOF'
XDG_DOCUMENTS_DIR="/openaec"
XDG_DESKTOP_DIR="/openaec"
XDG_DOWNLOAD_DIR="/openaec"
EOF
cd /openaec

node /opt/ocss/voorkeuren.mjs "$XDG_DATA_HOME/studio.openstructuralcalculation.app/preferences.json"

SCHERM="${OCSS_SCHERM:-1600x900}"
Xvfb :1 -screen 0 "${SCHERM}x24" -nolisten tcp &
for _ in $(seq 1 50); do xdpyinfo -display :1 >/dev/null 2>&1 && break; sleep 0.1; done
matchbox-window-manager -use_titlebar no -use_cursor yes &
x11vnc -display :1 -rfbport 5900 -localhost -forever -shared -nopw -quiet -noxdamage &
websockify --web /usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900 >/dev/null 2>&1 &
socat TCP-LISTEN:3001,fork,reuseaddr TCP:127.0.0.1:3879 &
node /opt/ocss/poort.mjs &

# Een bestand dat bij de start opent, als het er is.
ARGS=()
if [ -n "${OCSS_BESTAND:-}" ]; then
  if [ -f "$OCSS_BESTAND" ]; then ARGS+=("$OCSS_BESTAND"); else echo "[start] OCSS_BESTAND $OCSS_BESTAND bestaat niet" >&2; fi
fi

# De app; sluit de gebruiker hem, dan start hij opnieuw (de container blijft de app).
while true; do
  dbus-run-session -- /usr/bin/open-calcsheet-studio "${ARGS[@]}" || true
  echo "[start] de app is gestopt; opnieuw over 2 s" >&2
  sleep 2
done
