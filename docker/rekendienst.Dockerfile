# syntax=docker/dockerfile:1.7
#
# De rekendienst van Open CalcSheet Studio zonder venster (docs/rekendienst.md):
# rekenbladen doorrekenen via REST en MCP, en het rapport als PDF, voor de OpenAEC
# SuperCloud. Node voor de dienst, Chromium voor de PDF, en de server van Open FEM
# Studio voor Linux voor de @toets-, @fem- en @kern-blokken.
#
#   docker build -f docker/rekendienst.Dockerfile -t open-calcsheet-studio-api .
#   docker run -p 8080:8080 -e REKENDIENST_TOKEN=<sleutel van 16+ tekens> open-calcsheet-studio-api
#
# Licenties: de app is LGPL-3.0 (/opt/rekendienst/LICENSE), de npm-pakketten staan in
# /opt/rekendienst/THIRD-PARTY-NOTICES.txt. De server van FEM Studio is AGPL-3.0 en gaat
# nooit zonder zijn bron: /opt/rekendienst/fem-studio/ heeft de licentie, de vermeldingen
# van derden, SOURCE.txt en het bronarchief van precies die versie (docs/ontwikkelen.md).

ARG NODE_VERSIE=24

# ── Bouwen ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSIE}-bookworm-slim AS bouw
WORKDIR /bron
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/desktop/package.json packages/desktop/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build --workspace=@ifc-calc/core \
 && node scripts/bouw-rekendienst.mjs --paginas \
 && mkdir -p /uit/paginas \
 && node scripts/vermeldingen-derden.mjs /uit/THIRD-PARTY-NOTICES.txt \
 && cp -r packages/headless/dist/rekendienst.mjs LICENSE /uit/ \
 && cp -r packages/desktop/dist-rekendienst/. /uit/paginas/
# De server van FEM Studio voor linux-x64 uit de openbare release van deze repository,
# met zijn sha256 gecontroleerd, en zijn bronarchief. Geen server in versie.json voor dit
# platform (zoals linux-arm64, de SuperCloud op Graviton): de dienst rekent dan zonder (een
# @toets-blok staat als niet gerekend, /v1/health zegt fem: not_included).
RUN node scripts/haal-fem-server.mjs \
 && mkdir -p /uit/fem-studio \
 && cp -r packages/desktop/src-tauri/fem-studio/. /uit/fem-studio/ \
 && if [ -f /uit/fem-studio/openaec-mcp-server ]; then node scripts/haal-fem-server.mjs --bron /uit/fem-studio; fi

# ── De dienst ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSIE}-bookworm-slim
ARG VERSIE=onbekend
ARG REVISIE=onbekend
ARG BRON=https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio
LABEL org.opencontainers.image.title="Open CalcSheet Studio calculation service" \
      org.opencontainers.image.description="Headless calculation service of Open CalcSheet Studio: REST and MCP, results as JSON and the report as PDF." \
      org.opencontainers.image.version="${VERSIE}" \
      org.opencontainers.image.revision="${REVISIE}" \
      org.opencontainers.image.source="${BRON}" \
      org.opencontainers.image.url="${BRON}" \
      org.opencontainers.image.documentation="${BRON}/blob/main/docs/rekendienst.md" \
      org.opencontainers.image.vendor="OpenAEC Foundation" \
      org.opencontainers.image.licenses="LGPL-3.0-only AND AGPL-3.0-only"

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=bouw /uit/ /opt/rekendienst/

ENV NODE_ENV=production \
    REKENDIENST_ADRES=0.0.0.0 \
    REKENDIENST_POORT=8080 \
    REKENDIENST_PAGINAS=/opt/rekendienst/paginas \
    REKENDIENST_FEM_SERVER=/opt/rekendienst/fem-studio/openaec-mcp-server \
    REKENDIENST_CHROMIUM=/usr/bin/chromium \
    REKENDIENST_CHROMIUM_ZONDER_SANDBOX=1

# Zonder root: de gebruiker node van het basisimage.
USER node
WORKDIR /home/node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.REKENDIENST_POORT||8080)+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/rekendienst/rekendienst.mjs"]
