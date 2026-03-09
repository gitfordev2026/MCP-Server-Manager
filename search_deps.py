import os

target_1 = "Invalid message syntax"
target_2 = '"source": "message"'

paths_to_search = [
    r"d:\Practice\mcp\MCP-Server-Manager\be_env\Lib\site-packages",
    r"d:\Practice\mcp\MCP-Server-Manager\mock-mcp-server\.mock-mcp-env\Lib\site-packages"
]

for p in paths_to_search:
    if not os.path.exists(p):
        continue
    for root, dirs, files in os.walk(p):
        for f in files:
            if not f.endswith('.py'): continue
            path = os.path.join(root, f)
            try:
                with open(path, 'r', encoding='utf-8') as file:
                    content = file.read()
                    if target_1 in content or target_2 in content:
                        print(f"FOUND IN: {path}")
            except Exception:
                pass
print("Search complete.")
