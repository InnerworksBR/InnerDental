FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG APP_REVISION=unknown
LABEL org.opencontainers.image.title="luna-worker" org.opencontainers.image.revision=$APP_REVISION
ENV NODE_ENV=production
WORKDIR /app
RUN npm install --global pnpm@11.6.0 --fetch-timeout=600000
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --chown=node:node src ./src
COPY --chown=node:node worker ./worker
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
USER node
STOPSIGNAL SIGTERM
CMD ["pnpm", "worker"]
