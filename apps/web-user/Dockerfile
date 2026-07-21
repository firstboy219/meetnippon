# MeetNippon user portal (Next.js 14, standalone output). Context = repo root.
FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web-user/package.json apps/web-user/
RUN npm install
COPY apps/web-user apps/web-user

# ---------- dev ----------
FROM base AS dev
WORKDIR /app/apps/web-user
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM base AS build
WORKDIR /app/apps/web-user
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536
# Next inlines NEXT_PUBLIC_* at build time, so these must be present here —
# setting them on the container at run time would have no effect.
ARG NEXT_PUBLIC_DEFAULT_WORKSPACE=""
ARG NEXT_PUBLIC_EMAIL_HINT=""
ENV NEXT_PUBLIC_DEFAULT_WORKSPACE=$NEXT_PUBLIC_DEFAULT_WORKSPACE
ENV NEXT_PUBLIC_EMAIL_HINT=$NEXT_PUBLIC_EMAIL_HINT
RUN npm run build

# ---------- prod (standalone) ----------
FROM node:22-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web-user/.next/standalone ./
COPY --from=build /app/apps/web-user/.next/static ./apps/web-user/.next/static
COPY --from=build /app/apps/web-user/public ./apps/web-user/public
EXPOSE 3000
CMD ["node", "apps/web-user/server.js"]
