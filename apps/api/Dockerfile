# MeetNippon API — multi-stage. Debian slim (not alpine) so prisma engines and
# the argon2 native module resolve prebuilt binaries without a musl toolchain.
# Build context is the repo root (monorepo, npm workspaces).

# ---------- base: deps ----------
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=development
# workspace manifests first for layer caching
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm install
# source
COPY packages/shared packages/shared
COPY apps/api apps/api
# build shared package, then generate the prisma client (default schema path)
RUN npm run build --workspace @meetnippon/shared
RUN cd apps/api && npx prisma generate

# ---------- dev ----------
FROM base AS dev
WORKDIR /app/apps/api
EXPOSE 8081
CMD ["npm", "run", "start:dev"]

# ---------- build (compiles TS -> dist) ----------
FROM base AS build
RUN npm run build --workspace @meetnippon/api

# ---------- prod ----------
FROM node:22-bookworm-slim AS prod
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 8081
CMD ["node", "dist/main.js"]
