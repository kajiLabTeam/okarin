COMPOSE := docker compose

ENV ?= local
APP_TAG ?= latest
ENV_FILE ?= ./env/$(ENV)/common.env

BASE_FILES := -f compose.yml

ifeq ($(ENV),local)
COMPOSE_FILES := $(BASE_FILES) -f compose.local.yml
UP_ENVVARS :=
else ifeq ($(ENV),staging)
COMPOSE_FILES := $(BASE_FILES) -f compose.staging.yml
UP_ENVVARS := ENV_FILE=$(ENV_FILE)
else ifeq ($(ENV),production)
COMPOSE_FILES := $(BASE_FILES) -f compose.production.yml
UP_ENVVARS := ENV_FILE=$(ENV_FILE) APP_TAG=$(APP_TAG)
else
$(error Unsupported ENV='$(ENV)'. Use local|staging|production)
endif

.PHONY: help up down logs ps config

help:
	@echo "Usage examples:"
	@echo "  make up ENV=local"
	@echo "  make up ENV=staging ENV_FILE=./env/staging/common.env"
	@echo "  make up ENV=production ENV_FILE=./env/production/common.env APP_TAG=v1.0.0"

up:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) up -d --build --remove-orphans

down:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) down

logs:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) logs -f

ps:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) ps

config:
	$(UP_ENVVARS) $(COMPOSE) $(COMPOSE_FILES) config
