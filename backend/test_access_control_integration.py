import os
import httpx
import asyncio
import json

BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8090")
OWNER_ID = "mcp:test-server"
TOOL_ID = "test-tool"

async def test_access_control():
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        print("1. Listing policies...")
        try:
            resp = await client.get("/access-policies")
            resp.raise_for_status()
            policies = resp.json()["policies"]
            print("   Policies retrieved.")
        except Exception as e:
            print(f"FAILED to list policies: {e}")
            return

        print(f"\n2. Updating Default Policy for {OWNER_ID} with users/groups...")
        payload = {
            "mode": "allow",
            "allowed_users": ["user1@example.com", "user2@example.com"],
            "allowed_groups": ["admins"]
        }
        try:
            resp = await client.put(f"/access-policies/{OWNER_ID}", json=payload)
            resp.raise_for_status()
            data = resp.json()
            print("   Response:", json.dumps(data, indent=2))
            assert data["allowed_users"] == payload["allowed_users"]
            assert data["allowed_groups"] == payload["allowed_groups"]
            print("   SUCCESS: Default policy updated with users/groups.")
        except Exception as e:
            print(f"FAILED to update default policy: {e}")

        print(f"\n3. Updating Tool Policy for {OWNER_ID}/{TOOL_ID}...")
        payload_tool = {
            "mode": "approval",
            "allowed_users": ["tool_user@example.com"],
            "allowed_groups": ["tool_admins"]
        }
        try:
            resp = await client.put(f"/access-policies/{OWNER_ID}/{TOOL_ID}", json=payload_tool)
            resp.raise_for_status()
            data = resp.json()
            print("   Response:", json.dumps(data, indent=2))
            assert data["allowed_users"] == payload_tool["allowed_users"]
            assert data["allowed_groups"] == payload_tool["allowed_groups"]
            print("   SUCCESS: Tool policy updated with users/groups.")
        except Exception as e:
            print(f"FAILED to update tool policy: {e}")

if __name__ == "__main__":
    asyncio.run(test_access_control())
