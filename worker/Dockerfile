FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY src/lib ./src/lib
COPY worker ./worker
USER node
CMD ["./node_modules/.bin/tsx", "worker/video-worker.ts"]
