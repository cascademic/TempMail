FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
# Install all deps (incl. dev) so vite is available for the build
RUN npm ci

COPY . .
RUN npm run build

# Drop dev dependencies after the build to keep the image small
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 3000 2525

CMD ["node", "server/index.js"]
