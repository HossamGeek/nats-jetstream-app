# =========================
# Build Stage
# =========================

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


# =========================
# Production Stage
# =========================

FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]