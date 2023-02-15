# Stage 1: Build the TypeScript code
FROM node:14 as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Copy the built code and install the production dependencies
FROM node:14
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=build /app/build /app/build
EXPOSE 8080
CMD [ "npm", "start" ]