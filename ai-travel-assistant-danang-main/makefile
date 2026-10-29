.PHONY: dev prod migration-up seed

COMPOSE_DEV := docker compose -f docker/compose.dev.yml
COMPOSE_PROD := docker compose -f docker/compose.prod.yml --env-file .env

dev:
	$(COMPOSE_DEV) up --build --watch

prod:
	$(COMPOSE_PROD) up --build -d

migration-up:
	$(COMPOSE_DEV) exec api-dev pn prisma migrate dev
	$(COMPOSE_DEV) exec api-dev pn prisma generate

seed:
	$(COMPOSE_DEV) exec api-dev node prisma/seed.ts
