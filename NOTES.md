# NOTES

Short write-up of what I did in each phase and why.

## Setup notes

- The schema changed, so after pulling run `npx prisma db push` (or `npx prisma migrate deploy`). If the database already has old rows, `db push` may ask for `--accept-data-loss`. That's fine here, every row is temporary presence/signal data.
- No new env vars. Same `DATABASE_URL` and `NEXT_PUBLIC_MAPBOX_TOKEN` as before.

## Phase 1 - Make it run

How I found things: two browser profiles with different mock locations, watching the network tab, the `Presence`/`Signal` rows and `chrome://webrtc-internals`. Later I wrote a small API script and a two-browser Puppeteer run (fake camera) to check the whole flow end to end.

Bugs fixed:

1. **Dots never disappeared.** The heartbeat in `/api/poll` ran `updateMany({ where: {} })`, so every poll refreshed *every* user's `lastSeen`. Nobody ever went stale. Now it only updates the caller.
2. **Chat messages never showed up.** The sender sent `{ t: "msg" }` but the receiver only handled `t === "chat"`. Both sides use `"chat"` now.
3. **Users stayed "busy" forever after their first chat.** The `end` signal never cleared the busy flag, so after one conversation both people were greyed out and every new request was auto-declined. Ending now frees both sides.
4. **Flaky connections.** Early ICE candidates were queued, then flushed *before* `setRemoteDescription`. `addIceCandidate` fails silently without a remote description, so those candidates were thrown away. Now they are flushed after it.
5. **Closing the tab left the other person hanging.** Leaving (or going stale) now sends `end` to the partner and frees them right away, instead of waiting for WebRTC to time out.
6. **Missing Mapbox token showed a blank map.** There was a fake fallback token, so the "set your token" hint could never appear. Removed it.
7. Smaller things: the connect step had no timeout (now 25s with a message), negotiation errors were unhandled promise rejections, a sleeping tab could lose its session silently (now it re-joins automatically), and join failures left the button stuck on "Locating...".

## Phase 2 - Make it good

Goal: make it feel like a calm night sky with people glowing on it, not a dev demo.

- **3D globe** with atmosphere and stars. It slowly spins behind the landing card, then flies down to your location when you enter.
- **Landing card**: live "N online now" count, a vibe picker (see Phase 4), and three short privacy promises so people know what they're agreeing to.
- **Dots** are coloured by vibe, ripple at different times so the map feels alive, pop in when someone joins, and show a label on hover. Busy people turn grey.
- **HUD**: online count, vibe filter chips, "Surprise me" (connects you to a random free person), recenter button, a clean Leave button, and a friendly empty state with a "copy invite link" button.
- **Requests**: a "Knocking..." card with a countdown for the caller, and a modal for the receiver showing the caller's vibe and rough distance. Enter accepts, Esc declines. The tab title changes when someone knocks.
- **Chat**: grouped bubbles, a typing indicator, system lines ("Video ended"), icebreaker suggestions in the empty state.
- **Video**: side by side with the chat on desktop, full screen on mobile with a chat button and unread dot. Mic and camera toggles, mirrored self view.
- Glass panels, one accent colour, mobile safe areas, keyboard focus rings, and `prefers-reduced-motion` support.

## Phase 3 - Make it secure

Issues found, most serious first:

1. **No authentication at all (critical).** The session id was chosen by the client, and `/api/poll` sent every user's id to everyone. With someone's id you could read their mailbox (steal requests and SDP), kick them off with `/api/leave`, or send signals pretending to be them (`fromId` came from the body).
   - Fix: the server now creates the id plus a random secret on join. The client sends `Bearer <id>.<secret>`, and only a sha256 of the secret is stored, compared in constant time. `fromId` always comes from the token.
2. **No connection state on the server (high).** Anyone could send `accept` for any pair (marking random people busy) or push offers/ICE into strangers' calls.
   - Fix: the server tracks `pendingTo` and `peerId`. `accept`/`decline` only work for a real pending request, offer/answer/ice only between two connected peers, and each user can only have one request out at a time. Updates are conditional, so racing accepts can't double-book anyone.
3. **Flooding (medium).** No limits on joins, requests or payloads.
   - Fix: per-IP and per-session rate limits, a 200-message mailbox cap, a 16 KB payload cap and body size checks on every route.
   - Trade-off: the rate limiter is in memory, so on Vercel each instance counts separately. It's a first line of defence. The database rules above are the real guarantees. Next step would be Upstash/Redis.
4. **Location could be averaged out (medium).** A random 1-3 km offset averages to zero, so collecting many sessions of the same person reveals the exact spot.
   - Fix: snap to a 1 km grid cell first, then pick a random point on a ring around the cell centre. The distance from the real location still always stays within 1-3 km, but the average now lands on the cell centre, not the house. Coordinates are also rounded to about 10 m.
5. **Clickjacking (medium).** The app asks for camera, mic and location, so it must not be framed by another site. Added `X-Frame-Options: DENY`, `frame-ancestors 'none'`, a `Permissions-Policy` that only allows them on this origin, plus `nosniff`, `no-referrer` and COOP.
6. **Peer data trusted blindly (low).** Data channel messages are now type-checked and length-capped. React already escapes chat text, so there was no XSS.
7. **Errors (low).** Routes return a generic 500 instead of crashing or leaking details.
8. Removed the author's ngrok host from `allowedDevOrigins`.

Not fixed (known limits):

- WebRTC shows your IP address to the person you talk to. Fixing that needs a relay-only TURN server, which costs money and adds latency.
- No moderation or reporting backend. Block (Phase 4) is the session-level answer for now.

## Phase 4 - Make it better

The idea: talking to strangers on video is the scary part of an app like this. So I wanted it to feel **safe first**, then **alive**.

**Consent-first video ("Reveal me")**
- Every video call starts **blurred**. The blur is done on the *sender's* device: the camera is shrunk to 16x12 pixels and scaled back up before it goes into WebRTC. So the other person really never receives a sharp frame. A modified client can't remove the blur, because the pixels were never sent.
- Each person taps **Reveal me** when they're comfortable. That swaps the track with `replaceTrack`, so there's no renegotiation and no glitch. You can blur again at any time.
- Both sides see the state: "Stranger is blurred until they choose to reveal", "Stranger revealed", "Muted", "Camera off".
- I checked it in the browser test: the receiver gets a 320x240 pixelated stream before reveal and 1280x720 after.

**Vibes**
- Before entering you pick a vibe (Just chatting, Music talk, Language swap, Need a listener, Night owl, Travel stories). It colours your dot, shows in requests, and the map can be filtered by it. It helps people find the right conversation instead of tapping blindly. They're a fixed list on purpose, so there's no free text to moderate.

**Block**
- One tap (with a confirm) ends the chat, and you both vanish from each other's map for the rest of the session. Their requests get auto-declined without telling them why.

**Small "alive" touches**: live online and conversation counts, "Surprise me", rough distance ("~350 km away"), typing indicator, icebreakers.

What I'd do next with more time:
- A TURN server, and a "report" flow with real moderation.
- Replace polling with a realtime channel (Supabase Realtime, Pusher, or Postgres LISTEN/NOTIFY on a long-running server).
- Shared rate limiting with Redis.
- Unit tests for the signal state machine in CI, plus the Puppeteer flow I used locally.

## How I tested

- `tsc`, `eslint` and `next build` all pass.
- An API script (49 checks) against a local Postgres: auth, forged tokens, spoofing attempts, pairing rules, end/decline/leave/block, stale reaping and rate limits.
- A two-browser Puppeteer run with a fake camera: join, request, accept, chat both ways, video, blur to reveal to blur, mute, end video, leave, reconnect, block.
- A script that checks the privacy offset over 200k random points (always 1-3 km), plus an averaging attack over 5k sessions.
