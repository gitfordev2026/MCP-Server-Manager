# frontend/Dockerfile - Airgapped & Offline Ready
FROM node:20-slim AS builder

WORKDIR /app

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Copy package manifests
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies like typescript needed for build)
COPY node_modules* ./node_modules/
RUN if [ ! -d "./node_modules/next" ] || [ ! -d "./node_modules/typescript" ]; then npm install ; fi

# Copy application source code
COPY . .

# Build Next.js production bundle
RUN npm run build

# Stage 2: Production Runner container (Zero runtime network calls)
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["npm", "run", "start"]
