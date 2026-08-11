# NATS JetStream NestJS App

Simple NestJS application that bootstraps a reusable NATS connection using the official modern NATS.js Node transport package.

## What this project demonstrates

- NestJS HTTP application
- Global environment configuration using `@nestjs/config`
- Local NATS server with JetStream enabled using Docker Compose
- One shared NATS connection per NestJS application instance
- Core NATS service
- Demo service for see NATS behavior
- Basic health endpoint for checking NATS connection state
- Graceful shutdown hooks
- Unit tests for controller and service code
- ESLint setup

## Structure

```text
src/
├── demos/core-nats/              # HTTP-triggered learning demos
├── infrastructure/nats/          # reusable NATS connection + CoreNatsService
├── shared/interfaces/
└── shared/config
```

## Run locally

```bash
docker compose up -d
npm run start:dev
```

Health check:

```text
GET http://localhost:3000/health
```

## Run Core NATS demos

Run all demos:

```bash
curl -X POST http://localhost:3000/demos/core-nats/all
```

Run one demo:

```bash
curl -X POST http://localhost:3000/demos/core-nats/exact
curl -X POST http://localhost:3000/demos/core-nats/star
curl -X POST http://localhost:3000/demos/core-nats/greater-than
curl -X POST http://localhost:3000/demos/core-nats/fan-out
curl -X POST http://localhost:3000/demos/core-nats/at-most-once
```


## Tests and checks

Integration tests require a real NATS server:

```bash
docker compose up -d
npm test -- --runInBand
npm run lint
npm run build
```

## Environment

Copy `.env.example` to `.env` if needed.