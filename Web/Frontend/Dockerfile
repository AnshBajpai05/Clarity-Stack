# Web Frontend — Vite/React build served by nginx (§10.4)
#
# VITE_* are inlined at BUILD time, so they are ARGs, not runtime env. The
# browser runs on the host, so the defaults point at host-mapped service ports
# (localhost:<port>), not compose-internal hostnames.
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_BACKEND_URL=http://localhost:8000
ARG VITE_SATELLITE_URL=http://localhost:8003
ARG VITE_EDITOR_BACKEND_URL=http://localhost:8004
ARG VITE_SRS_API_URL=http://localhost:8001
ARG VITE_UML_URL=http://localhost:8007
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_BACKEND_URL=$VITE_BACKEND_URL \
    VITE_SATELLITE_URL=$VITE_SATELLITE_URL \
    VITE_EDITOR_BACKEND_URL=$VITE_EDITOR_BACKEND_URL \
    VITE_SRS_API_URL=$VITE_SRS_API_URL \
    VITE_UML_URL=$VITE_UML_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8006
