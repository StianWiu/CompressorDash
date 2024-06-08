# Use a multi-stage build to minimize the final image size

# Stage 1: Build the Vue project
FROM node:18 AS build-stage

WORKDIR /app/web

# Copy the package.json and package-lock.json files
COPY ./web/package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the Vue project files
COPY ./web/ .

# Build the Vue project
RUN npm run build

# Stage 2: Set up the Express server
FROM node:18

WORKDIR /app

# Install ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Copy the package.json and package-lock.json files for the server
COPY ./server/package*.json ./server/

# Install server dependencies
RUN cd ./server && npm ci

# Copy the built Vue project and the server code
COPY --from=build-stage /app/web/dist ./web/dist
COPY ./server ./server

# Set the working directory to the server folder
WORKDIR /app/server

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]
