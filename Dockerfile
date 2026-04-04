# Stage 1: Build the TypeScript code
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Stage 2: Copy the built code and the node modules
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package*.json ./
COPY schema.graphql ./

# Don't run as root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001
RUN chown -R nodeuser:nodejs /app
USER nodeuser

EXPOSE 8080
CMD ["npm", "start"]
