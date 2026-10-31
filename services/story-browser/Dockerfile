# Build from repository root. Reuse only the audited, committed npm lockfile.
FROM node:22-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev \
    && npx --no-install playwright install --with-deps chromium
COPY services/story-browser ./services/story-browser
RUN chown -R node:node /app /ms-playwright
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "services/story-browser/server.mjs"]
