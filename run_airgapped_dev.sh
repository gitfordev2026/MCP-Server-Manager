#!/usr/bin/env bash
# ==========================================================================
# MCP SERVER MANAGER - 100% AIRGAPPED LIVE DEVELOPMENT LAUNCHER
# ==========================================================================
# Run this script on an airgapped / offline machine to start live development
# with code volume mounts and hot-reloading (uvicorn --reload & npm run dev).
# ==========================================================================

set -e

echo "=== [1/3] Checking Airgapped Development Docker Images ==="
if [ -f "airgap_bundle/mcp_dev_airgapped_bundle.tar.gz" ]; then
    echo "Loading airgapped development images..."
    gunzip -c airgap_bundle/mcp_dev_airgapped_bundle.tar.gz | docker load
    echo "✅ Development Docker images loaded successfully!"
fi

echo ""
echo "=== [2/3] Launching Live Offline Development Environment ==="
docker compose -f docker-compose-airgapped-dev.yml up -d

echo ""
echo "=== [3/3] Checking Development Container Status ==="
docker compose -f docker-compose-airgapped-dev.yml ps

echo ""
echo "=========================================================================="
echo "🚀 LIVE AIRGAPPED DEVELOPMENT ENVIRONMENT ACTIVE!"
echo "=========================================================================="
echo "  • Hot-reloading enabled for: ./backend/app and ./frontend"
echo "  • Frontend Web App:     http://localhost:3000/"
echo "  • New Landing Page:     http://localhost:3000/new"
echo "  • Backend API Gateway:  http://localhost:8000/docs"
echo "  • Keycloak Identity:    http://localhost:8080/admin/"
echo "=========================================================================="
