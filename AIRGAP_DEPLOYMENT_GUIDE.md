# 📦 MCP Server Manager - Airgapped Offline Deployment Guide

This guide explains where the generated airgapped offline bundle images are stored and provides step-by-step instructions for deploying and running the entire application on an isolated (offline) PC.

---

## 📂 Location of Generated Bundle & Docker Images

All generated offline artifacts are located in your project root directory:

| Artifact | File / Folder Path | Description |
| :--- | :--- | :--- |
| **Complete Airgapped Archive** | `/media/vip/New Volume4/Practice/MCP Server Manager/MCP-Server-Manager/mcp-server-manager-airgap-bundle.tar.gz` | **573MB–603MB** single compressed package containing frontend, backend, docker images & installer. |
| **Docker Images Tarballs** | `./airgap_bundle/docker_images/` | Pre-exported `.tar` images (`mcp-frontend_latest.tar`, `mcp-backend_latest.tar`, `mcp-mock-server_latest.tar`). |
| **Packager Script** | `./prepare-offline-airgap.sh` | Automated script that builds Next.js production standalone, exports docker images, and packages the bundle. |

> [!NOTE]
> All tarball archives (`*.tar`, `*.tar.gz`, `airgap_bundle/`) are automatically excluded from Git via `.gitignore`.

---

## 🚀 Step-by-Step Guide: Deploying on Your Offline Airgapped PC

### Prerequisites on the Offline PC:
* **Docker Engine** & **Docker Compose** installed (e.g. Docker Desktop, or standard Docker Engine on Linux).
* **USB drive or local network file transfer** to move the file.

---

### Step 1: Transfer the Archive
Copy `mcp-server-manager-airgap-bundle.tar.gz` from your online computer to a USB drive and paste it onto your offline PC.

```bash
cp /media/vip/New\ Volume4/Practice/MCP\ Server\ Manager/MCP-Server-Manager/mcp-server-manager-airgap-bundle.tar.gz /path/to/usb/
```

---

### Step 2: Extract the Package on the Offline PC
Open a terminal on your offline PC and extract the bundle into a directory of your choice:

```bash
# Create directory and extract
mkdir -p ~/mcp-manager
tar -xzf mcp-server-manager-airgap-bundle.tar.gz -C ~/mcp-manager
cd ~/mcp-manager
```

---

### Step 3: Run the 1-Click Offline Installer
Run the automated installer script:

```bash
./install-airgap.sh
```

#### What `install-airgap.sh` does automatically:
1. Executes `docker load -i docker_images/*.tar` to import all application images locally without internet access.
2. Checks/generates configuration environment files (`.env`).
3. Launches containers via `docker compose up -d`.
4. Displays container status and active access URLs.

---

### Step 4: Verify Application Access

Once started, open your web browser on the offline PC:

* **Public Visitor View:** [`http://localhost:3000`](http://localhost:3000) (or `http://<OFFLINE_PC_IP>:3000`)
* **Admin Access Point:** [`http://localhost:3000/new`](http://localhost:3000/new)
* **Backend FastAPI Services:** [`http://localhost:8000`](http://localhost:8000)

---

## 🛠️ Management Commands on Offline PC

* **Check Service Status:**
  ```bash
  docker compose ps
  ```

* **View Logs:**
  ```bash
  docker compose logs -f
  ```

* **Stop the Stack:**
  ```bash
  docker compose down
  ```

* **Restart Stack:**
  ```bash
  docker compose restart
  ```
