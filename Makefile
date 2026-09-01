SHELL := /bin/bash
.DEFAULT_GOAL := help
.NOTPARALLEL: deploy deploy-upload deploy-package check build

DEPLOY_HOST ?= dolomiti2
DEPLOY_REMOTE_DIR ?= /home/dolomiti/apps/pubblicazioni-social/app
DEPLOY_CONFIG_DIR ?= /home/dolomiti/apps/pubblicazioni-social/config
DEPLOY_ENV_TEMPLATE := $(CURDIR)/deploy/production.env.example
DEPLOY_ROOT := $(CURDIR)/.deploy
DEPLOY_STAGE := $(DEPLOY_ROOT)/app
DEPLOY_BATCH := $(DEPLOY_ROOT)/sftp.batch

.PHONY: help check build deploy-check deploy-package deploy-upload deploy deploy-clean

help: ## Mostra i comandi disponibili
	@awk 'BEGIN {FS = ":.*## "; printf "Uso: make <comando>\n\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check: ## Esegue typecheck, lint e test
	npm run typecheck
	npm run lint
	npm test

build: ## Crea la build Next.js standalone
	npm run build

deploy-check: ## Verifica i prerequisiti locali del deploy
	@command -v node >/dev/null || { echo "Errore: node non trovato." >&2; exit 1; }
	@command -v npm >/dev/null || { echo "Errore: npm non trovato." >&2; exit 1; }
	@command -v sftp >/dev/null || { echo "Errore: sftp non trovato." >&2; exit 1; }
	@test -f package-lock.json || { echo "Errore: package-lock.json non trovato." >&2; exit 1; }
	@test -f "$(DEPLOY_ENV_TEMPLATE)" || { echo "Errore: template production.env.example non trovato." >&2; exit 1; }
	@test -d node_modules || { echo "Errore: dipendenze assenti; esegui npm ci." >&2; exit 1; }
	@echo "Host SFTP: $(DEPLOY_HOST)"
	@echo "Destinazione: $(DEPLOY_REMOTE_DIR)"
	@echo "Template configurazione: $(DEPLOY_CONFIG_DIR)/production.env.example"

deploy-package: build ## Prepara in .deploy/app il pacchetto da trasferire
	@rm -rf -- "$(DEPLOY_ROOT)"
	@mkdir -p "$(DEPLOY_STAGE)/.next"
	cp -aL .next/standalone/. "$(DEPLOY_STAGE)/"
	@rm -rf -- "$(DEPLOY_STAGE)/data"
	cp -a .next/static "$(DEPLOY_STAGE)/.next/static"
	cp -a public "$(DEPLOY_STAGE)/public"
	node scripts/create-sftp-batch.mjs "$(DEPLOY_STAGE)" "$(DEPLOY_REMOTE_DIR)" "$(DEPLOY_BATCH)" "$(DEPLOY_ENV_TEMPLATE)" "$(DEPLOY_CONFIG_DIR)/production.env.example"
	@echo "Pacchetto pronto in $(DEPLOY_STAGE)"

deploy-upload: deploy-check check deploy-package ## Verifica, prepara e trasferisce il pacchetto via SFTP
	sftp -b "$(DEPLOY_BATCH)" "$(DEPLOY_HOST)"

deploy: deploy-upload ## Build e pubblicazione SFTP su produzione
	@echo "Deploy completato in $(DEPLOY_HOST):$(DEPLOY_REMOTE_DIR)"
	@echo "Nota: SFTP non riavvia il processo Node.js; verifica il servizio sul server."

deploy-clean: ## Elimina soltanto il pacchetto locale di deploy
	rm -rf -- "$(DEPLOY_ROOT)"
