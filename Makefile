# Project configuration
PROJECT_NAME ?= llm-d-prism
REGISTRY ?= ghcr.io/llm-d
IMAGE ?= $(REGISTRY)/$(PROJECT_NAME)
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
PLATFORMS ?= linux/amd64,linux/arm64

# Container engine: docker buildx if present, else podman. Override with
# CONTAINER_TOOL=podman to force one.
CONTAINER_TOOL ?= $(shell docker buildx version >/dev/null 2>&1 && echo docker || echo podman)

# Go configuration
GOFLAGS ?=
LDFLAGS ?= -s -w -X main.version=$(VERSION)

# Tools
GOLANGCI_LINT_VERSION ?= v2.8.0

.DEFAULT_GOAL := help

##@ General

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: build
build: ## Build the Go binary
	@if [ -d "./cmd" ] && find ./cmd -name "*.go" | head -1 | grep -q .; then \
		go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o bin/$(PROJECT_NAME) ./cmd/; \
	elif find . -maxdepth 1 -name "*.go" | head -1 | grep -q .; then \
		go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o bin/$(PROJECT_NAME) .; \
	else \
		echo "No Go files found, skipping build"; \
	fi

.PHONY: test
test: ## Run tests with race detection
	@if find . -name "*.go" -not -path "./.git/*" | head -1 | grep -q .; then \
		go test -race -count=1 ./...; \
	else \
		echo "No Go files found, skipping tests"; \
	fi

.PHONY: test-coverage
test-coverage: ## Run tests with coverage report
	@if find . -name "*.go" -not -path "./.git/*" | head -1 | grep -q .; then \
		go test -race -coverprofile=coverage.out -covermode=atomic ./... && \
		go tool cover -html=coverage.out -o coverage.html; \
	else \
		echo "No Go files found, skipping coverage"; \
	fi

.PHONY: lint
lint: lint-go lint-python ## Run all linters

.PHONY: lint-go
lint-go: ## Run Go linter (golangci-lint v2)
	golangci-lint run

.PHONY: lint-python
lint-python: ## Run Python linter (ruff) — skipped if no Python files found
	@if ls *.py **/*.py 2>/dev/null | head -1 > /dev/null 2>&1; then \
		ruff check . && ruff format --check .; \
	else \
		echo "No Python files found, skipping Python lint"; \
	fi

.PHONY: fmt
fmt: ## Format Go and Python code
	gofmt -w .
	@if ls *.py **/*.py 2>/dev/null | head -1 > /dev/null 2>&1; then \
		ruff format .; \
	fi

.PHONY: generate
generate: ## Run go generate
	go generate ./...

.PHONY: vet
vet: ## Run go vet
	go vet ./...

.PHONY: tidy
tidy: ## Run go mod tidy
	go mod tidy

.PHONY: pre-commit
pre-commit: ## Run pre-commit hooks on all files
	pre-commit run --all-files

##@ Container

.PHONY: image-build
image-build: ## Build multi-arch container image (local only)
ifeq ($(CONTAINER_TOOL),docker)
	docker buildx build \
		--platform $(PLATFORMS) \
		--tag $(IMAGE):$(VERSION) \
		--tag $(IMAGE):latest \
		.
else
	podman manifest rm $(IMAGE):$(VERSION) 2>/dev/null || true
	podman build \
		--platform $(PLATFORMS) \
		--manifest $(IMAGE):$(VERSION) \
		.
endif

.PHONY: image-push
image-push: ## Build and push multi-arch container image
ifeq ($(CONTAINER_TOOL),docker)
	docker buildx build \
		--platform $(PLATFORMS) \
		--push \
		--annotation "index:org.opencontainers.image.source=https://github.com/llm-d/$(PROJECT_NAME)" \
		--annotation "index:org.opencontainers.image.licenses=Apache-2.0" \
		--tag $(IMAGE):$(VERSION) \
		--tag $(IMAGE):latest \
		.
else
	$(MAKE) image-build
	podman manifest push --all $(IMAGE):$(VERSION) docker://$(IMAGE):$(VERSION)
	podman manifest push --all $(IMAGE):$(VERSION) docker://$(IMAGE):latest
endif

##@ CI Helpers

.PHONY: ci-lint
ci-lint: ## CI: install and run golangci-lint
	@which golangci-lint > /dev/null 2>&1 || go install github.com/golangci/golangci-lint/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)
	golangci-lint run

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf bin/ coverage.out coverage.html
