# ============================================================================
# Stage 1: Build all 4 NestJS Microservices in the Monorepo
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY libs ./libs
COPY apps ./apps

RUN npm run build:all

# ============================================================================
# Stage 2: Lightweight Production Runtime Image
# ============================================================================
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled microservices and Protocol Buffer contracts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/libs/contracts/src/proto ./libs/contracts/src/proto

EXPOSE 3000 50051 50052

# Default command starts ingestion-service (overridden per K8s Deployment)
CMD ["node", "dist/apps/ingestion-service/apps/ingestion-service/src/main.js"]
