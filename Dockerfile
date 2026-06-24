FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV AVIS_DATA_FILE=/data/avis.json

COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
  && pnpm install --prod --frozen-lockfile

COPY . .

RUN addgroup -S avis \
  && adduser -S avis -G avis \
  && mkdir -p /data \
  && chown -R avis:avis /app /data

USER avis

EXPOSE 3000

CMD ["node", "server.js"]
