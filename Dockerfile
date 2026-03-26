# Build stage
FROM node:25-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Serve stage
FROM node:25-alpine

WORKDIR /app

# Install production dependencies for server
COPY package*.json ./
RUN npm install --omit=dev

# Copy server and built assets
COPY server ./server
COPY --from=build /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
