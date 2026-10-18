FROM oven/bun:1-slim
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 DATA_DIR=/data BACKUP_DIR=/backups
RUN mkdir -p /data /backups && chown -R bun:bun /data /backups /app
USER bun
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD bun -e "fetch('http://127.0.0.1:8787/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["bun", "src/server.ts"]
