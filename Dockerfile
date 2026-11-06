FROM node:26-alpine AS base

WORKDIR /app

# Stage 1: Development (targeted by docker-compose.yml)
FROM base AS development

RUN apk add --no-cache git && \
    git config --global --add safe.directory '*'

COPY package*.json ./
RUN npm install

CMD ["npm", "run", "dev"]

# Stage 2: Build frontend assets
FROM base AS build

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build && npm run build:cli

# Stage 3: Production server (default final stage for Cloud Run)
FROM base AS production

# Install production dependencies for server
COPY package*.json ./
RUN npm install --omit=dev

# Copy server and built assets
COPY server ./server
COPY src/utils ./src/utils
COPY --from=build /app/skills/prism-results ./skills/prism-results
COPY --from=build /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
