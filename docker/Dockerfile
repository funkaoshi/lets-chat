FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

RUN mkdir -p uploads builtAssets \
    && chown -R node:node uploads builtAssets

ENV LCB_DATABASE_URI=mongodb://mongo/letschat \
    LCB_HTTP_HOST=0.0.0.0 \
    LCB_HTTP_PORT=8080

USER node

EXPOSE 8080

VOLUME ["/usr/src/app/config", "/usr/src/app/uploads"]

CMD ["npm", "start"]
