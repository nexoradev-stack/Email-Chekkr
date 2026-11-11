# Email Chekkr API — container image. No npm packages are needed: the server uses only Node's built-in modules.
FROM node:22-alpine

ENV NODE_ENV=production \
    EMAIL_CHEKKR_HOST=0.0.0.0 \
    PORT=8787

WORKDIR /app
COPY package.json ./
COPY server ./server
# The shared checking engine and the disposable domain list
COPY site/assets/js/engine ./site/assets/js/engine
COPY site/assets/data/disposable-domains.txt ./site/assets/data/disposable-domains.txt

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["node", "server/index.js"]
