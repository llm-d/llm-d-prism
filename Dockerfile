# Multi-stage build for {{PROJECT_NAME}}
# Supports multi-arch: linux/amd64, linux/arm64

# --- Build stage ---
FROM golang:1.24 AS builder

WORKDIR /workspace

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /workspace/app .

# --- Runtime stage ---
FROM gcr.io/distroless/static:nonroot

WORKDIR /
COPY --from=builder /workspace/app .

USER 65532:65532

ENTRYPOINT ["/app"]
