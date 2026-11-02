# Online rooms
PeerJS (WebRTC), host-authoritative. The host phone runs the game; guests connect through the free PeerJS broker. `js/net.js` is transport; room logic is in `js/app.js` (`createRoom, hostMessage, publishState, joinRoom, guestConnect, inflate ...`).
- **Room code:** 6 digits (was `LB-XXXXX`). Link form `#room=482913`. Peer id `limpa-bf-<code>`.
- Messages: hello, welcome, lobby, state, act, reject, ping, pong, profile, leave, bye, full, **buzz**.
- Hidden cards are blanked per seat (`E.redact`); the guest cannot see others' hands.
- Rejoin by token; host resume via localStorage `limpa.host`, guest `limpa.session`; away seats get a computer takeover after 3 min.
- **Join reliability (PR 7):** guest screen shows stages (matchmaking server, finding host, joining), 10 s timeouts with 2 auto-retries, hello resent every 4 s until the host answers. Cause of a slow join on a real phone was never reproduced (sandbox joined in 1 s). If it recurs, suspect the free openrelay TURN entry in `ICE`.
- **Buzzer (PR 8):** "Ring <name>" while waiting on a human; sound, vibration, toast; 4 s rate limit; relayed through the host.
- Gotcha: after `git reset` to main the branch name stays the same, so any open PR on it changes too. Check `grep` for features before pushing.
