# Satellite — Express + Mongoose knowledge store (§10.4 containerization)
FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching. Use the committed lockfile (npm, §9.2).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source (node_modules / data / .env excluded via .dockerignore)
COPY . .

# Inside a container the service must listen on all interfaces; the host-side
# localhost default (§5.5) is overridden here, not in app code.
ENV BIND_HOST=0.0.0.0 \
    PORT=8003

EXPOSE 8003
CMD ["node", "server.js"]
