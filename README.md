# {{PROJECT_NAME}}

<!-- TODO: Replace {{PROJECT_NAME}} with your project name -->
<!-- TODO: Update badges below with correct repo path -->

[![CI](https://github.com/llm-d/{{PROJECT_NAME}}/actions/workflows/ci-pr-checks.yaml/badge.svg)](https://github.com/llm-d/{{PROJECT_NAME}}/actions/workflows/ci-pr-checks.yaml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> **One-line description of what this project does.**

## Overview

<!-- TODO: Describe what this project does, why it exists, and how it fits into the llm-d ecosystem -->

## Prerequisites

- Go 1.24+
- Docker (for container builds)
- [pre-commit](https://pre-commit.com/) (for local development)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/llm-d/{{PROJECT_NAME}}.git
cd {{PROJECT_NAME}}

# Install pre-commit hooks
pre-commit install

# Build
make build

# Run tests
make test

# Run linters
make lint
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines, coding standards, and how to submit changes.

### Common Commands

```bash
make help           # Show all available targets
make build          # Build the project
make test           # Run tests with race detection
make lint           # Run Go and Python linters
make fmt            # Format Go and Python code
make image-build    # Build multi-arch container image
make pre-commit     # Run pre-commit hooks
```

## Architecture

<!-- TODO: Add architecture overview, diagrams, or links to design docs -->

## Configuration

<!-- TODO: Document configuration options, environment variables, CLI flags -->

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

All commits must be signed off (DCO). See [PR_SIGNOFF.md](PR_SIGNOFF.md) for instructions.

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md).

## License

This project is licensed under the Apache License 2.0 - see [LICENSE](LICENSE) for details.
