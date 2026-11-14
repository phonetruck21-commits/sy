# S.Y LIVE SERVICE – API server + web UI (technician console, admin, customer viewer)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY e2e/package.json e2e/
COPY desktop/package.json desktop/
RUN npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npm run build -w web && npm run build -w server && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/web/dist \
    MEDIA_DIR=/data/media
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/migrations server/migrations
COPY --from=build /app/web/dist web/dist
RUN mkdir -p /data/media && chown -R node:node /data
WORKDIR /app/server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
