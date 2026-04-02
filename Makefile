COMPOSE := docker compose

STAGING_ENV ?= ./env/staging/common.env
PRODUCTION_ENV ?= ./env/production/common.env
APP_TAG ?= latest

.PHONY: help \
	local-up local-down local-logs local-ps \
	staging-up staging-down staging-logs staging-ps \
	production-up production-down production-logs production-ps

help:
	@echo "Usage:"
	@echo "  make local-up"
	@echo "  make staging-up STAGING_ENV=./env/staging/common.env"
	@echo "  make production-up PRODUCTION_ENV=./env/production/common.env APP_TAG=v1.0.0"

local-up:
	$(COMPOSE) -f compose.yml -f compose.local.yml up -d --build

local-down:
	$(COMPOSE) -f compose.yml -f compose.local.yml down

local-logs:
	$(COMPOSE) -f compose.yml -f compose.local.yml logs -f

local-ps:
	$(COMPOSE) -f compose.yml -f compose.local.yml ps

staging-up:
	ENV_FILE=$(STAGING_ENV) $(COMPOSE) -f compose.yml -f compose.staging.yml up -d --build

staging-down:
	ENV_FILE=$(STAGING_ENV) $(COMPOSE) -f compose.yml -f compose.staging.yml down

staging-logs:
	ENV_FILE=$(STAGING_ENV) $(COMPOSE) -f compose.yml -f compose.staging.yml logs -f

staging-ps:
	ENV_FILE=$(STAGING_ENV) $(COMPOSE) -f compose.yml -f compose.staging.yml ps

production-up:
	ENV_FILE=$(PRODUCTION_ENV) APP_TAG=$(APP_TAG) $(COMPOSE) -f compose.yml -f compose.production.yml up -d --build --remove-orphans

production-down:
	ENV_FILE=$(PRODUCTION_ENV) $(COMPOSE) -f compose.yml -f compose.production.yml down

production-logs:
	ENV_FILE=$(PRODUCTION_ENV) $(COMPOSE) -f compose.yml -f compose.production.yml logs -f

production-ps:
	ENV_FILE=$(PRODUCTION_ENV) $(COMPOSE) -f compose.yml -f compose.production.yml ps
