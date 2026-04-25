PROJECT_NAME ?= okarin-$(ENV)

ENV ?= local
ENV_FILE ?= ./deploy/env.$(ENV)
COMPOSE = docker compose --env-file $(ENV_FILE) -p $(PROJECT_NAME)

BASE_FILES := -f compose.yml

ifeq ($(ENV),local)
COMPOSE_FILES := $(BASE_FILES) -f compose.local.yml
UP_ARGS := -d --build --remove-orphans
else ifeq ($(ENV),staging)
COMPOSE_FILES := $(BASE_FILES) -f compose.staging.yml
UP_ARGS := -d --build --remove-orphans
else ifeq ($(ENV),production)
COMPOSE_FILES := $(BASE_FILES) -f compose.production.yml
UP_ARGS := -d --build --remove-orphans
else
$(error Unsupported ENV='$(ENV)'. Use local|staging|production)
endif

.PHONY: help pull up down logs ps config db-status db-up db-down db-dump db-new

help:
	@echo "Usage examples:"
	@echo "  make up ENV=local"
	@echo "  make up ENV=staging ENV_FILE=./deploy/env.staging"
	@echo "  make up ENV=production ENV_FILE=./deploy/env.production"
	@echo "  make pull ENV=production ENV_FILE=./deploy/env.production"
	@echo "  make up ENV=production PROJECT_NAME=okarin-prod-a"
	@echo "  make db-status ENV=local"
	@echo "  make db-up ENV=local"
	@echo "  make db-new ENV=local NAME=init"

pull:
	$(COMPOSE) $(COMPOSE_FILES) pull

up:
	$(COMPOSE) $(COMPOSE_FILES) up $(UP_ARGS)

down:
	$(COMPOSE) $(COMPOSE_FILES) down

logs:
	$(COMPOSE) $(COMPOSE_FILES) logs -f

ps:
	$(COMPOSE) $(COMPOSE_FILES) ps

config:
	$(COMPOSE) $(COMPOSE_FILES) config

db-status:
	$(COMPOSE) $(COMPOSE_FILES) --profile tools run --rm dbmate status

db-up:
	$(COMPOSE) $(COMPOSE_FILES) --profile tools run --rm dbmate up

db-down:
	$(COMPOSE) $(COMPOSE_FILES) --profile tools run --rm dbmate down

db-dump:
	$(COMPOSE) $(COMPOSE_FILES) --profile tools run --rm dbmate dump

db-new:
ifndef NAME
	$(error NAME is required. Use NAME=create_something)
endif
	$(COMPOSE) $(COMPOSE_FILES) --profile tools run --rm dbmate new $(NAME)
