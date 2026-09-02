SHELL := /bin/bash
.DEFAULT_GOAL := help
.NOTPARALLEL: deploy deploy-upload deploy-activate deploy-package check build

DEPLOY_HOST ?= dolomiti2
DEPLOY_BASE_DIR ?= /home/dolomiti/apps/pubblicazioni-social
DEPLOY_REMOTE_DIR ?= $(DEPLOY_BASE_DIR)/app
DEPLOY_CONFIG_DIR ?= $(DEPLOY_BASE_DIR)/config
DEPLOY_REMOTE_STAGE ?= $(DEPLOY_BASE_DIR)/.deploy/app
DEPLOY_ENV_TEMPLATE := $(CURDIR)/deploy/production.env.example
DEPLOY_START_SCRIPT := $(CURDIR)/deploy/start
DEPLOY_STOP_SCRIPT := $(CURDIR)/deploy/stop
DEPLOY_NATIVE_SCRIPT := $(CURDIR)/deploy/install-native
DEPLOY_ROOT := $(CURDIR)/.deploy
DEPLOY_STAGE := $(DEPLOY_ROOT)/app

.PHONY: help check build deploy-check deploy-package deploy-upload deploy-activate deploy-stop deploy-start deploy deploy-clean

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
	@command -v ssh >/dev/null || { echo "Errore: ssh non trovato." >&2; exit 1; }
	@command -v rsync >/dev/null || { echo "Errore: rsync non trovato." >&2; exit 1; }
	@test -f package-lock.json || { echo "Errore: package-lock.json non trovato." >&2; exit 1; }
	@test -f "$(DEPLOY_ENV_TEMPLATE)" || { echo "Errore: template production.env.example non trovato." >&2; exit 1; }
	@test -f "$(DEPLOY_START_SCRIPT)" || { echo "Errore: script deploy/start non trovato." >&2; exit 1; }
	@test -f "$(DEPLOY_STOP_SCRIPT)" || { echo "Errore: script deploy/stop non trovato." >&2; exit 1; }
	@test -f "$(DEPLOY_NATIVE_SCRIPT)" || { echo "Errore: script deploy/install-native non trovato." >&2; exit 1; }
	@test -d node_modules || { echo "Errore: dipendenze assenti; esegui npm ci." >&2; exit 1; }
	@echo "Host SSH: $(DEPLOY_HOST)"
	@echo "Destinazione: $(DEPLOY_REMOTE_DIR)"
	@echo "Template configurazione: $(DEPLOY_CONFIG_DIR)/production.env.example"

deploy-package: build ## Prepara in .deploy/app il pacchetto da trasferire
	@rm -rf -- "$(DEPLOY_ROOT)"
	@mkdir -p "$(DEPLOY_STAGE)/.next"
	cp -a .next/standalone/. "$(DEPLOY_STAGE)/"
	@rm -rf -- "$(DEPLOY_STAGE)/data"
	cp -a .next/static "$(DEPLOY_STAGE)/.next/static"
	cp -a public "$(DEPLOY_STAGE)/public"
	@if find "$(DEPLOY_STAGE)" -type f \( -name '.env' -o -name '.env.*' -o -name '*.sqlite' -o -name '*.sqlite-wal' -o -name '*.sqlite-shm' \) -print -quit | grep -q .; then \
		echo "Errore: il pacchetto contiene file riservati." >&2; exit 1; \
	fi
	@echo "Pacchetto pronto in $(DEPLOY_STAGE)"

deploy-upload: deploy-check deploy-package ## Sincronizza build, script e template nell'area remota di staging
	ssh "$(DEPLOY_HOST)" "mkdir -p '$(DEPLOY_REMOTE_STAGE)' '$(DEPLOY_REMOTE_DIR)' '$(DEPLOY_CONFIG_DIR)'"
	rsync -azh --delete-delay --force --partial --info=progress2,stats2 "$(DEPLOY_STAGE)/" "$(DEPLOY_HOST):$(DEPLOY_REMOTE_STAGE)/"
	rsync -az --partial "$(DEPLOY_ENV_TEMPLATE)" "$(DEPLOY_HOST):$(DEPLOY_CONFIG_DIR)/production.env.example"
	rsync -az --partial "$(DEPLOY_START_SCRIPT)" "$(DEPLOY_STOP_SCRIPT)" "$(DEPLOY_NATIVE_SCRIPT)" "$(DEPLOY_HOST):$(DEPLOY_BASE_DIR)/.deploy/"

deploy-activate: ## Ferma il server, promuove lo staging e lo riavvia
	ssh "$(DEPLOY_HOST)" "cd '$(DEPLOY_BASE_DIR)' && install -m 0755 '.deploy/start' 'start' && install -m 0755 '.deploy/stop' 'stop' && install -m 0755 '.deploy/install-native' 'install-native' && ./stop && rsync -ah --delete-delay --force --info=progress2,stats2 --filter='protect /data/***' --filter='protect /.env' --filter='protect /.env.*' --filter='protect /node_modules/better-sqlite3/build/Release/better_sqlite3.node' '.deploy/app/' 'app/' && ./install-native && ./start"

deploy-stop: ## Ferma manualmente il server remoto
	ssh "$(DEPLOY_HOST)" "cd '$(DEPLOY_BASE_DIR)' && ./stop"

deploy-start: ## Avvia manualmente il server remoto
	ssh "$(DEPLOY_HOST)" "cd '$(DEPLOY_BASE_DIR)' && ./start"

deploy: check deploy-upload deploy-activate ## Build, sync rsync e riavvio su produzione
	@echo "Deploy completato in $(DEPLOY_HOST):$(DEPLOY_REMOTE_DIR)"
	@echo "Server riavviato tramite $(DEPLOY_BASE_DIR)/stop e start."

deploy-clean: ## Elimina soltanto il pacchetto locale di deploy
	rm -rf -- "$(DEPLOY_ROOT)"
