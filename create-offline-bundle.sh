#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  MCP SERVER MANAGER - AIRGAPPED OFFLINE BUNDLE CREATOR   "
echo "=========================================================="
echo ""

BUNDLE_NAME="mcp-server-manager-airgap-bundle"
OUTPUT_TAR="${BUNDLE_NAME}.tar.gz"

echo "1. Building Production Standalone Next.js Frontend inside Docker container..."
docker exec -i -e NODE_ENV=production mcp-frontend npm run build

echo ""
echo "2. Preparing Airgapped Bundle Archive Structure..."
rm -rf dist_offline
mkdir -p dist_offline

echo "3. Copying Frontend Production Standalone files..."
mkdir -p dist_offline/frontend
cp -r frontend/.next/standalone/* dist_offline/frontend/ 2>/dev/null || true
cp -r frontend/.next/static dist_offline/frontend/.next/ 2>/dev/null || true
cp -r frontend/public dist_offline/frontend/ 2>/dev/null || true
cp frontend/package.json dist_offline/frontend/

echo "4. Copying Backend & Configuration Files..."
cp -r backend dist_offline/
cp -r docker-compose.yml dist_offline/ 2>/dev/null || true
cp -r .env dist_offline/.env 2>/dev/null || cp frontend/.env.local dist_offline/.env || true

echo "5. Creating Deployment Script inside Bundle..."
cat << 'EOF' > dist_offline/run-offline.sh
#!/usr/bin/env bash
set -e

echo "Starting MCP Server Manager in Offline / Airgapped Environment..."

export NODE_ENV=production
export HOST=${HOST:-"0.0.0.0"}
export PORT=${PORT:-"3000"}

if command -v docker-compose &> /dev/null || command -v docker &> /dev/null; then
    echo "Launching via Docker Compose..."
    docker compose up -d || docker-compose up -d
else
    echo "Launching Frontend standalone Node.js server..."
    cd frontend
    node server.js
fi
EOF

chmod +x dist_offline/run-offline.sh

echo ""
echo "6. Compressing bundle into ${OUTPUT_TAR}..."
tar -czf "${OUTPUT_TAR}" -C dist_offline .

echo ""
echo "=========================================================="
echo "  SUCCESS! AIRGAPPED OFFLINE BUNDLE CREATED SUCCESSFULLY  "
echo "=========================================================="
echo "Archive File : ${OUTPUT_TAR}"
echo "Size         : $(du -h ${OUTPUT_TAR} | cut -f1)"
echo ""
echo "To deploy on an offline PC:"
echo " 1. Copy ${OUTPUT_TAR} to your offline PC."
echo " 2. Extract: tar -xzf ${OUTPUT_TAR} -C mcp-manager"
echo " 3. Run    : cd mcp-manager && ./run-offline.sh"
echo "=========================================================="
