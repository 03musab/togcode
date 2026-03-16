import requests
headers = {"Authorization": "Bearer csk-yjmhny5wcyh5dmt4wf9f5mp3k6w4cvkerw2vrh4ceyxh46vr"}
r = requests.get("https://api.cerebras.ai/v1/models", headers=headers)
models = [m['id'] for m in r.json()['data']]
print("Available models:", models)
