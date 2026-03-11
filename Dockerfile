FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --omit=dev

COPY hcaptcha.js server.js ./
COPY src ./src
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
