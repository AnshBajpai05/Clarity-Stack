# Editor — collaborative editor backend (file-persisted, §2.2/§3.3)
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Listen on all interfaces inside the container (host default is localhost, §5.5).
ENV BIND_HOST=0.0.0.0 \
    PORT=8004

# Collab data persists to disk; mount a volume at /app/data in compose so it
# survives restarts and is not baked into the image.
EXPOSE 8004
CMD ["node", "server.js"]
