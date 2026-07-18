# ─────────────────────────────────────────────────────────────
# SigmaCRM API — imagem para Fly.io
# Build context: SigmaAtendimento/ (rode `fly deploy` a partir daqui)
# ─────────────────────────────────────────────────────────────

# ---- Stage 1: build ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# OpenSSL é exigido pelo engine do Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copia só os manifestos primeiro para aproveitar cache de layers.
# Todos os package.json dos workspaces precisam existir para o npm resolver o grafo.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/whatsapp-api/package.json apps/whatsapp-api/package.json
COPY packages/shared/package.json packages/shared/package.json

# Instala TODAS as deps (inclui dev: precisamos de tsc e prisma CLI no build)
RUN npm install

# Copia o restante do código-fonte
COPY . .

# Gera o Prisma Client e compila apenas a API
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build:api

# ---- Stage 2: runtime ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copia node_modules (já com o Prisma Client gerado) e os artefatos compilados
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages

# A porta é definida via env PORT (fly.toml). Documental:
EXPOSE 8080

CMD ["node", "apps/api/dist/server.js"]
