import requests
url = "http://localhost:8092/mcp/apps/sse"
try:
    with requests.get(url, stream=True) as r:
        for line in r.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                print(line_str)
                if line_str.startswith('data: '):
                    endpoint = line_str[6:]
                    # The endpoint might be a relative path, so let's combine if so
                    if endpoint.startswith('/'):
                        endpoint = "http://localhost:8092" + endpoint
                    print(f"Endpoint: {endpoint}")
                    resp = requests.post(
                        endpoint,
                        headers={"Content-Type": "application/json"},
                        data='{"invalid": "jsonrpc"}'
                    )
                    print(resp.status_code)
                    print(resp.text)
                    break
except Exception as e:
    print(e)
