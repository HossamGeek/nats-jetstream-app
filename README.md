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
├── modules/demos/core-nats/      # HTTP-triggered learning demos
├── modules/health/               # health endpoint
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

Queue Group demo APIs:

```bash
curl -X POST http://localhost:3000/demos/core-nats/queue-group/jobs
curl -X POST http://localhost:3000/demos/core-nats/queue-group/jobs/batch
```

Normal subscribers all receive one message. Queue Group subscribers using the same subject and `demo-workers` group compete, so each message is handled by one group member.

## Request / Reply Demos

Request/Reply sends a message to a NATS subject and waits for a responder response until the configured timeout.

Successful RPC:
```bash
curl http://localhost:3000/core-nats/request-reply/users/user-100
```

Timeout scenario:
```bash
curl http://localhost:3000/core-nats/request-reply/timeout
```

No responder scenario:
```bash
curl http://localhost:3000/core-nats/request-reply/no-responder
```


## Tests and checks

Tests are unit tests and do not require a real NATS server. Running the HTTP demos still requires NATS from Docker Compose.

```bash
npm test -- --runInBand
npm run lint
npm run build
```

## Environment

Copy `.env.example` to `.env` if needed.
