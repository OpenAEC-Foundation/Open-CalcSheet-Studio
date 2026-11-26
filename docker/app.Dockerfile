# syntax=docker/dockerfile:1.7
#
# De Linux-app van Open CalcSheet Studio als container, voor de werkplek van de OpenAEC
# SuperCloud: de grafische app zelf, schermvullend in een minimale grafische sessie,
# gestreamd naar de browser op poort 3000. Geen bureaublad, geen root, geen FUSE, geen GPU.
#
# Uit de release zelf: de .deb van die release, geen aparte bouw van de app. De workflow
# (docker-images.yml) haalt hem op, controleert zijn OpenPGP-handtekening en zet hem met
# het bronarchief van de FEM-server in docker/app/pakket/:
#
#   docker build -f docker/app.Dockerfile -t open-calcsheet-studio .
#   docker run -p 3000:3000 -v <map>:/openaec open-calcsheet-studio
#
# Zie README.md (Docker) en docs/supercloud-werkplek.md.

FROM debian:bookworm-slim
ARG VERSIE=onbekend
ARG REVISIE=onbekend
ARG BRON=https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio
LABEL org.opencontainers.image.title="Open CalcSheet Studio" \
      org.opencontainers.image.description="The Open CalcSheet Studio Linux app, full screen and streamed to the browser on port 3000." \
      org.opencontainers.image.version="${VERSIE}" \
      org.opencontainers.image.revision="${REVISIE}" \
      org.opencontainers.image.source="${BRON}" \
      org.opencontainers.image.url="${BRON}" \
      org.opencontainers.image.documentation="${BRON}#docker" \
      org.opencontainers.image.vendor="OpenAEC Foundation" \
      org.opencontainers.image.licenses="LGPL-3.0-only AND AGPL-3.0-only"

COPY docker/app/pakket/ /tmp/pakket/
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      /tmp/pakket/*_amd64.deb \
      xvfb x11-utils xdotool matchbox-window-manager x11vnc novnc python3-websockify \
      dbus socat nodejs procps tini ca-certificates fonts-dejavu-core fonts-liberation; \
    rm -rf /var/lib/apt/lists/*; \
    test -x /usr/bin/open-calcsheet-studio; \
    # De server van Open FEM Studio (AGPL-3.0) gaat nooit zonder zijn bron: het
    # bronarchief van precies die versie naast de licentie, de vermeldingen en SOURCE.txt
    # die de .deb al meebrengt.
    FEM="$(dirname "$(find /usr/lib -path '*fem-studio/SOURCE.txt' | head -n 1)")"; \
    test -f "$FEM/LICENSE-AGPL-3.0.txt"; \
    mv /tmp/pakket/openaec-mcp-server_*_source.tar.gz "$FEM/"; \
    rm -rf /tmp/pakket; \
    useradd --create-home --uid 1000 --shell /usr/sbin/nologin openaec; \
    mkdir -p /openaec /config; \
    chown openaec:openaec /openaec /config

COPY docker/app/start.sh docker/app/poort.mjs docker/app/voorkeuren.mjs /opt/ocss/
RUN chmod 755 /opt/ocss/start.sh

USER openaec
VOLUME ["/config"]
WORKDIR /openaec
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/gezond').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/ocss/start.sh"]
