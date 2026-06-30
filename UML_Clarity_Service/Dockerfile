# UML-Clarity UI — Vite build served by nginx (§10.4)
#
# VITE_API_URL is build-time and points at the UML backend's host-mapped port
# (browser runs on the host). Vendor LLM keys live ONLY on that backend (§1.6).
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ARG VITE_API_URL=http://localhost:8005
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8007
