# MeetNippon admin portal (Next.js 14, standalone). Context = repo root.
FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web-admin/package.json apps/web-admin/
RUN npm install
COPY apps/web-admin apps/web-admin

FROM base AS dev
WORKDIR /app/apps/web-admin
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS build
WORKDIR /app/apps/web-admin
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536
# Next inlines NEXT_PUBLIC_* at build time, so these must be present here —
# setting them on the container at run time would have no effect.
ARG NEXT_PUBLIC_HIDE_BILLING=""
ARG NEXT_PUBLIC_DEFAULT_WORKSPACE=""
ENV NEXT_PUBLIC_HIDE_BILLING=$NEXT_PUBLIC_HIDE_BILLING
ENV NEXT_PUBLIC_DEFAULT_WORKSPACE=$NEXT_PUBLIC_DEFAULT_WORKSPACE
RUN npm run build

FROM node:22-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web-admin/.next/standalone ./
COPY --from=build /app/apps/web-admin/.next/static ./apps/web-admin/.next/static
COPY --from=build /app/apps/web-admin/public ./apps/web-admin/public
EXPOSE 3000
CMD ["node", "apps/web-admin/server.js"]
