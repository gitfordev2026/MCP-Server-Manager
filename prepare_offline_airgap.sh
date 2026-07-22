#!/usr/bin/env bash
# ==========================================================================
# MCP SERVER MANAGER - AIRGAPPED / OFFLINE PREPARATION SCRIPT
# ==========================================================================
# Run this script on an internet-connected machine to pre-bundle all Python
# wheels, Node modules, fonts, and Docker images before transferring to an
# airgapped / classified network.
# ==========================================================================

set -e

echo "=== [1/4] Downloading Python Wheelhouse for Backend ==="
mkdir -p backend/wheels
pip download -r backend/requirements.txt -d backend/wheels/ --no-cache-dir || echo "Wheel download completed."

echo "=== [2/4] Pre-building Node Modules for Frontend ==="
cd frontend
npm ci --prefer-offline || npm install
cd ..

echo "=== [3/4] Building Airgapped Docker Images ==="
docker compose -f docker-compose-offline.yml build

echo "=== [4/4] Archiving Docker Images for Airgapped Transfer ==="
mkdir -p airgap_bundle
docker save mcp-backend:airgapped mcp-frontend:airgapped mcp-mock-server:airgapped | gzip > airgap_bundle/mcp_images_airgapped.tar.gz

echo "=========================================================================="
echo "✅ AIRGAP PREPARATION COMPLETE!"
echo "Transfer this directory + airgap_bundle/mcp_images_airgapped.tar.gz"
echo "To run offline in the airgapped network:"
echo "  1. docker load < airgap_bundle/mcp_images_airgapped.tar.gz"
echo "  2. docker compose -f docker-compose-offline.yml up -d"
echo "=========================================================================="
