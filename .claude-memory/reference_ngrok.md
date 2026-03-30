---
name: Ngrok tunnel details for EMP Cloud
description: Ngrok domain, auth token, and tunnel configuration for exposing EMP Cloud frontend publicly
type: reference
---

**Ngrok Domain**: rapturously-tracheidal-cadence.ngrok-free.dev
**Auth Token**: 3BAf1mJou1zUVsptbBOmrHA0xkT_Hs5ogvqmzgWQPNmgmUoE
**Tunnels to**: EMP Cloud Vite client on port 5174 (localhost)
**Start command**: `ngrok.cmd http 5174 --url=rapturously-tracheidal-cadence.ngrok-free.dev`
**Inspector**: http://localhost:4040

These details are also stored in `empcloud/.env` under NGROK_AUTHTOKEN and NGROK_DOMAIN.
The ngrok domain is added to ALLOWED_ORIGINS in the .env for CORS.
Vite config has `allowedHosts: [".ngrok-free.dev"]` to allow ngrok traffic.
