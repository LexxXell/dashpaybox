# dash-pay microservice. better-sqlite3 needs a native build toolchain.
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev && apt-get purge -y python3 make g++ && apt-get autoremove -y
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data
EXPOSE 8090
CMD ["node", "dist/index.js"]
