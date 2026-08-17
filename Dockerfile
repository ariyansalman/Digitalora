FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

# Keep dependency resolution on the public npm registry. Runtime secrets are
# supplied by Railway at container start, never as Docker build arguments.
RUN npm ci --ignore-scripts --registry=https://registry.npmjs.org/

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["node", "dist/src/index.js"]