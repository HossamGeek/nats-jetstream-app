# NATS JetStream NestJS App

Simple NestJS application that bootstraps a reusable NATS connection using the official modern NATS.js Node transport package.

This project currently includes only the connection infrastructure. It does **not** implement publish/subscribe, request/reply, streams, consumers, or JetStream APIs yet.

## What is included

- NestJS HTTP application
- Global environment configuration using `@nestjs/config`
- Local NATS server with JetStream enabled using Docker Compose
- One shared NATS connection per NestJS application instance
- Basic health endpoint for checking NATS connection state
- Graceful shutdown hooks
- Unit tests for controller and service code
- ESLint setup

## Main structure

```text
src/
├── app.controller.ts
├── app.module.ts
├── app.service.ts
├── main.ts
├── health/
├── infrastructure/
│   └── nats/
└── shared/
    ├── config/
    ├── constants/
    └── interfaces/
```

## Environment variables

Copy `.env.example` to `.env` before running locally.

```env
PORT=3000
NATS_SERVERS=nats://localhost:4222
NATS_CONNECTION_NAME=nats-jetstream-app
NATS_CONNECT_TIMEOUT=5000
NATS_FAIL_ON_STARTUP=false
```

`NATS_SERVERS` supports multiple servers:

```env
NATS_SERVERS=nats://node1:4222,nats://node2:4222,nats://node3:4222
```

## Run locally

Start NATS with JetStream enabled:

```bash
docker compose up -d
```

Start the NestJS app:

```bash
npm run start:dev
```

Check health:

```bash
GET http://localhost:3000/health
```

Stop NATS:

```bash
docker compose down
```

Remove NATS JetStream volume too:

```bash
docker compose down -v
```

## Scripts

```bash
npm run build
npm run start
npm run start:dev
npm run lint
npm run lint:fix
npm test
```

## Notes

- NATS connection is created only inside `NatsService`.
- Other modules should reuse the same connection through dependency injection.
- NestJS `ClientProxy`, `ClientNats`, and JetStream client/manager APIs are intentionally not used in this task.
