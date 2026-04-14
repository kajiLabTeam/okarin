PROJECT_NAME ?= okarin-$(ENV)
COMPOSE := docker compose -p $(PROJECT_NAME)

ENV ?= local
APP_TAG ?= latest
ENV_FILE ?= ./deploy/env.$(ENV)

BASE_FILES := -f compose.yml

ifeq ($(ENV),local)
COMPOSE_FILES := $(BASE_FILES) -f compose.local.yml
UP_ENVVARS :=
UP_ARGS := -d --build --remove-orphans
else ifeq ($(ENV),staging)
COMPOSE_FILES := $(BASE_FILES) -f compose.staging.yml
UP_ENVVARS := ENV_FILE=$(ENV_FILE)
UP_ARGS := -d --build --remove-orphans
else ifeq ($(ENV),production)
	COMPOSE_FILES := $(BASE_FILES) -f compose.production.yml
	UP_ENVVARS := ENV_FILE=$(ENV_FILE)
	UP_ARGS := -d --build --remove-orphans
else
$(error Unsupported ENV='$(ENV)'. Use local|staging|production)
endif

.PHONY: help pull up down logs ps config

help:
	@echo "Usage examples:"
	@echo "  make up ENV=local"
	@echo "  make up ENV=staging ENV_FILE=./deploy/env.staging"
	@echo "  make up ENV=production ENV_FILE=./deploy/env.production"
	@echo "  make pull ENV=production ENV_FILE=./deploy/env.production"
	@echo "  make up ENV=production PROJECT_NAME=okarin-prod-a"

pull:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) pull

up:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) up $(UP_ARGS)

down:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) down

logs:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) logs -f

ps:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) ps

config:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) config
