# BLAZE CHASE

Multiplayer web arena shooter. 2-4 players. No install required — play in browser.

## Dev (local)

```bash
cd server && npm install && node src/index.js
```

Open **http://localhost:3080** in two browser tabs.

- Tab 1 → **Create Room** → get 4-letter code
- Tab 2 → **Join Room** → enter code
- Both select ship → **Ready** → countdown → fight

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Thrust |
| A / ← | Turn left |
| D / → | Turn right |
| S / ↓ | Reverse |
| Space | Fire |
| Shift | Dash |
| Ctrl | Dodge |
| Q | Switch weapon |

## Deploy (production)

Server runs on Coolify via Docker. Frontend is served by the same Node.js process on port 3080. Point your reverse proxy at port 3080.

WebSocket URL: `wss://blazechase-ws.zusho.it`

```bash
# Coolify builds the Dockerfile at repo root context
# docker build -f server/Dockerfile .
```
