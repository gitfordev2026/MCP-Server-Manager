#!/usr/bin/env bash
# ==============================================================================
#  MCP SERVER MANAGER - COMPLETE AIRGAPPED OFFLINE BUNDLE GENERATOR
# ==============================================================================

set -e

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[1;32m"
COLOR_CYAN="\033[1;36m"
COLOR_YELLOW="\033[1;33m"
COLOR_RED="\033[1;31m"

echo -e "${COLOR_CYAN}======================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}   MCP SERVER MANAGER - COMPLETE AIRGAPPED OFFLINE PACKAGER           ${COLOR_RESET}"
echo -e "${COLOR_CYAN}======================================================================${COLOR_RESET}"
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="${ROOT_DIR}/airgap_bundle"
IMAGE_DIR="${BUNDLE_DIR}/docker_images"
ARCHIVE_TAR="${ROOT_DIR}/mcp-server-manager-airgap-bundle.tar.gz"

# 1. Clean previous staging directories
echo -e "${COLOR_YELLOW}[1/6] Cleaning staging workspace...${COLOR_RESET}"
rm -rf "${BUNDLE_DIR}" 2>/dev/null || true
rm -rf "${ARCHIVE_TAR}" 2>/dev/null || true
mkdir -p "${BUNDLE_DIR}" "${IMAGE_DIR}"

# 2. Build Next.js Production Standalone
echo -e "${COLOR_YELLOW}[2/6] Compiling Next.js Standalone Production Build inside Docker...${COLOR_RESET}"
if docker ps --format '{{.Names}}' | grep -q "^mcp-frontend$"; then
    docker exec -i -e NODE_ENV=production mcp-frontend npm run build
else
    echo -e "${COLOR_RED}Container 'mcp-frontend' is not running. Building via local docker image...${COLOR_RESET}"
    cd "${ROOT_DIR}/frontend"
    npm run build
    cd "${ROOT_DIR}"
fi

# 3. Export Docker Images as Tarballs for offline installation
echo -e "${COLOR_YELLOW}[3/6] Saving Docker Images for Airgapped Machine (docker save)...${COLOR_RESET}"

images_to_save=(
    "mcp-frontend:latest"
    "mcp-backend:latest"
    "mcp-mock-server:latest"
)

for img in "${images_to_save[@]}"; do
    tar_name="$(echo "$img" | tr '/:' '_').tar"
    if docker image inspect "$img" >/dev/null 2>&1; then
        echo -e "  -> Exporting ${COLOR_CYAN}${img}${COLOR_RESET} to ${IMAGE_DIR}/${tar_name}..."
        docker save "$img" -o "${IMAGE_DIR}/${tar_name}"
    else
        echo -e "  -> ${COLOR_RED}Warning: Image '$img' not found locally. Skipping...${COLOR_RESET}"
    fi
done

# 4. Copy Production Standalone & Application Files
echo -e "${COLOR_YELLOW}[4/6] Copying source code & production standalone build...${COLOR_RESET}"

mkdir -p "${BUNDLE_DIR}/frontend"
mkdir -p "${BUNDLE_DIR}/backend"
mkdir -p "${BUNDLE_DIR}/mock-mcp-server"

# Copy Next.js standalone production files
if [ -d "${ROOT_DIR}/frontend/.next/standalone" ]; then
    cp -r "${ROOT_DIR}/frontend/.next/standalone/"* "${BUNDLE_DIR}/frontend/"
    cp -r "${ROOT_DIR}/frontend/.next/static" "${BUNDLE_DIR}/frontend/.next/" 2>/dev/null || true
    cp -r "${ROOT_DIR}/frontend/public" "${BUNDLE_DIR}/frontend/" 2>/dev/null || true
    cp "${ROOT_DIR}/frontend/package.json" "${BUNDLE_DIR}/frontend/" 2>/dev/null || true
else
    cp -r "${ROOT_DIR}/frontend" "${BUNDLE_DIR}/"
fi

cp -r "${ROOT_DIR}/backend/app" "${BUNDLE_DIR}/backend/"
cp -r "${ROOT_DIR}/backend/Dockerfile"* "${BUNDLE_DIR}/backend/" 2>/dev/null || true
cp -r "${ROOT_DIR}/backend/requirements.txt" "${BUNDLE_DIR}/backend/" 2>/dev/null || true

cp -r "${ROOT_DIR}/mock-mcp-server/"* "${BUNDLE_DIR}/mock-mcp-server/" 2>/dev/null || true
cp "${ROOT_DIR}/docker-compose.yml" "${BUNDLE_DIR}/"

if [ -f "${ROOT_DIR}/.env" ]; then
    cp "${ROOT_DIR}/.env" "${BUNDLE_DIR}/.env"
fi

# 5. Generate Master Installer Script inside Bundle
echo -e "${COLOR_YELLOW}[5/6] Generating Master Installer (install-airgap.sh)...${COLOR_RESET}"

cat << 'EOF' > "${BUNDLE_DIR}/install-airgap.sh"
#!/usr/bin/env bash
set -e

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[1;32m"
COLOR_CYAN="\033[1;36m"
COLOR_YELLOW="\033[1;33m"
COLOR_RED="\033[1;31m"

echo -e "${COLOR_CYAN}======================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}   MCP SERVER MANAGER - AIRGAPPED OFFLINE INSTALLER                   ${COLOR_RESET}"
echo -e "${COLOR_CYAN}======================================================================${COLOR_RESET}"
echo ""

# Step A: Load Docker Images
if [ -d "docker_images" ]; then
    echo -e "${COLOR_YELLOW}[1/3] Loading offline Docker Images...${COLOR_RESET}"
    for img_tar in docker_images/*.tar; do
        if [ -f "$img_tar" ]; then
            echo -e "  -> Loading $img_tar..."
            docker load -i "$img_tar"
        fi
    done
fi

# Step B: Ensure .env exists
if [ ! -f ".env" ] && [ -f "backend/app/.env" ]; then
    cp backend/app/.env .env
fi

# Step C: Launch Services via Docker Compose
echo -e "${COLOR_YELLOW}[2/3] Starting MCP Server Manager Stack...${COLOR_RESET}"
if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    docker compose up -d
elif command -v docker-compose &>/dev/null; then
    docker-compose up -d
else
    echo -e "${COLOR_RED}Error: Neither 'docker compose' nor 'docker-compose' was found on this system.${COLOR_RESET}"
    exit 1
fi

echo ""
echo -e "${COLOR_YELLOW}[3/3] Checking Container Status...${COLOR_RESET}"
sleep 3
docker ps --filter "name=mcp-"

echo ""
echo -e "${COLOR_GREEN}======================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}   SUCCESS! MCP SERVER MANAGER IS LIVE ON AIRGAPPED SYSTEM            ${COLOR_RESET}"
echo -e "${COLOR_GREEN}======================================================================${COLOR_RESET}"
echo -e "  - Frontend URL : http://localhost:3000 (or http://<IP>:3000)"
echo -e "  - Backend API  : http://localhost:8000 (or http://<IP>:8000)"
echo -e "  - Admin Secret : http://localhost:3000/new"
echo -e "${COLOR_CYAN}======================================================================${COLOR_RESET}"
EOF

chmod +x "${BUNDLE_DIR}/install-airgap.sh"

# 6. Compress into Tarball
echo -e "${COLOR_YELLOW}[6/6] Compressing bundle into ${ARCHIVE_TAR}...${COLOR_RESET}"
tar --warning=no-file-changed -czf "${ARCHIVE_TAR}" -C "${BUNDLE_DIR}" . 2>/dev/null || tar -czf "${ARCHIVE_TAR}" -C "${BUNDLE_DIR}" .

echo ""
echo -e "${COLOR_CYAN}======================================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}   AIRGAPPED OFFLINE BUNDLE CREATED SUCCESSFULLY!                      ${COLOR_RESET}"
echo -e "${COLOR_CYAN}======================================================================${COLOR_RESET}"
echo -e " Archive File : ${COLOR_GREEN}${ARCHIVE_TAR}${COLOR_RESET}"
echo -e " Bundle Size  : ${COLOR_CYAN}$(du -h "${ARCHIVE_TAR}" | cut -f1)${COLOR_RESET}"
echo ""
echo -e " Instructions for Offline PC:"
echo -e "  1. Transfer ${COLOR_GREEN}mcp-server-manager-airgap-bundle.tar.gz${COLOR_RESET} via USB."
echo -e "  2. Extract: ${COLOR_CYAN}mkdir mcp-manager && tar -xzf mcp-server-manager-airgap-bundle.tar.gz -C mcp-manager${COLOR_RESET}"
echo -e "  3. Run    : ${COLOR_CYAN}cd mcp-manager && ./install-airgap.sh${COLOR_RESET}"
echo -e "${COLOR_CYAN}======================================================================${COLOR_RESET}"
