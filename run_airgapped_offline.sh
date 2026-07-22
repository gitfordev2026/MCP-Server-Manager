#!/usr/bin/env bash
# ==========================================================================
# MCP SERVER MANAGER - 100% AIRGAPPED OFFLINE LAUNCHER
# ==========================================================================
# Run this script on an airgapped / offline server to load Docker images and
# start all microservices without any internet connection.
# ==========================================================================

set -e

echo "=== [1/3] Loading Pre-bundled Airgapped Docker Images ==="
if [ -f "airgap_bundle/mcp_images_airgapped.tar.gz" ]; then
    echo "Found airgapped bundle archive. Loading images into Docker engine..."
    gunzip -c airgap_bundle/mcp_images_airgapped.tar.gz | docker load
    echo "✅ Docker images loaded successfully!"
else
    echo "ℹ️  No tar archive found in airgap_bundle/. Using existing local Docker images."
fi

echo ""
echo "=== [2/3] Starting MCP Server Manager Platform (Offline Mode) ==="
docker compose -f docker-compose-offline.yml up -d

echo ""
echo "=== [3/3] Checking Container Status ==="
docker compose -f docker-compose-offline.yml ps

echo ""
echo "=========================================================================="
echo "🚀 MCP SERVER MANAGER PLATFORM RUNNING 100% OFFLINE!"
echo "=========================================================================="
echo "  • Frontend Web App:     http://localhost:3000/"
echo "  • New Landing Page:     http://localhost:3000/new"
echo "  • Backend API Gateway:  http://localhost:8000/docs"
echo "  • Keycloak Identity:    http://localhost:8080/admin/"
echo "=========================================================================="
