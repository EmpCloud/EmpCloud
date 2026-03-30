---
name: Always deploy to ngrok before asking user to test
description: User only tests via ngrok URLs, not localhost. Always ensure ngrok tunnels are running before telling user to test anything.
type: feedback
---

Always deploy to ngrok before telling the user to test something. The user ONLY tests via ngrok URLs, never localhost.

**Why:** The user has ngrok set up for a reason — to simulate real-world deployment with separate domains. They will not test on localhost.

**How to apply:**
- Before saying "try it" or "test it", verify both ngrok tunnels are running and returning 200
- EMP Cloud: rapturously-tracheidal-cadence.ngrok-free.dev (authtoken: 3BAf1mJou1zUVsptbBOmrHA0xkT_Hs5ogvqmzgWQPNmgmUoE)
- EMP Recruit: unliterary-acronically-sharee.ngrok-free.dev (authtoken: 3BAfPGVelN9NvW2pscfqYimJWe1_5ZqNKyPQbntWCyLkkZ6YF)
- If tunnels are down, restart them before telling user to test
- Each module will have its own ngrok domain as they get built
