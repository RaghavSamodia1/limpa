/* Limpa's Breakfast: peer-to-peer rooms.
   The host's phone runs the game and every guest connects straight to it (WebRTC, via PeerJS). The free PeerJS
   broker is only used to introduce the two phones; no game data goes through a server of ours.
   This file is just the transport: connect, reconnect, send and receive JSON. The room rules live in js/app.js. */
(function () {
'use strict';

const PREFIX = 'limpa-bf-';
// STUN finds a phone's public address. TURN relays when two phones cannot reach each other directly (some mobile
// networks). The open relay below is a free community service: swap in your own TURN server here if you have one.
const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
] };
const idFor = (code) => PREFIX + String(code).toLowerCase().replace(/[^a-z0-9]/g, '');
const available = () => typeof window.Peer === 'function';
const newPeer = (id) => new window.Peer(id, { config: ICE, debug: 0, pingInterval: 5000 });

/* Host: opens a room with a fixed id and accepts guests.
   handlers: onOpen(), onPeer(key), onMessage(key, msg), onGone(key), onError(kind, err), onLost() */
function host(code, h) {
  const conns = new Map();            // peer key -> data connection
  let peer = null, closed = false, retries = 0, mender = null;

  function start() {
    peer = newPeer(idFor(code));
    peer.on('open', () => { retries = 0; h.onOpen && h.onOpen(); });
    peer.on('connection', (c) => {
      c.on('open', () => {
        const old = conns.get(c.peer); conns.set(c.peer, c); h.onPeer && h.onPeer(c.peer);
        if (old && old !== c) { try { old.close(); } catch (e) {} }
      });
      c.on('data', (m) => { h.onMessage && h.onMessage(c.peer, m); });
      c.on('close', () => { if (conns.get(c.peer) === c) { conns.delete(c.peer); h.onGone && h.onGone(c.peer); } });
      c.on('error', () => {});
    });
    peer.on('disconnected', () => { if (!closed) setTimeout(() => { try { if (!closed && peer.disconnected) peer.reconnect(); } catch (e) {} }, 1500); });
    peer.on('error', (err) => {
      if (closed) return;
      if (err.type === 'unavailable-id' && retries < 12) {       // the broker still remembers an earlier session: try again shortly
        retries++; try { peer.destroy(); } catch (e) {} setTimeout(() => { if (!closed) start(); }, 2500); return;
      }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') { h.onError && h.onError('network', err); return; }
      h.onError && h.onError(err.type, err);
    });
    peer.on('close', () => { if (!closed) h.onLost && h.onLost(); });
  }
  start();
  // phones suspend pages that are in the background (for example while sharing the link): reconnect when we are back
  const onVis = () => { if (document.visibilityState === 'visible' && peer && peer.disconnected && !closed) { try { peer.reconnect(); } catch (e) {} } };
  document.addEventListener('visibilitychange', onVis);
  mender = setInterval(() => { if (peer && peer.disconnected && !closed && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } }, 6000);

  return {
    send(key, msg) { const c = conns.get(key); if (c && c.open) { try { c.send(msg); return true; } catch (e) {} } return false; },
    drop(key) { const c = conns.get(key); if (c) { conns.delete(key); try { c.close(); } catch (e) {} } },
    has: (key) => conns.has(key),
    close() { closed = true; clearInterval(mender); document.removeEventListener('visibilitychange', onVis); conns.forEach((c) => { try { c.close(); } catch (e) {} }); try { peer.destroy(); } catch (e) {} },
  };
}

/* Guest: connects to a room.
   handlers: onOpen(), onMessage(msg), onClose(), onError(kind, err) */
function join(code, h) {
  let peer = null, conn = null, closed = false, opened = false;
  peer = newPeer();
  const fail = (kind, err) => { if (!closed) h.onError && h.onError(kind, err); };
  peer.on('open', () => {
    conn = peer.connect(idFor(code), { reliable: true, serialization: 'json' });
    const timer = setTimeout(() => { if (!opened) fail('timeout'); }, 20000);
    conn.on('open', () => { opened = true; clearTimeout(timer); h.onOpen && h.onOpen(); });
    conn.on('data', (m) => { h.onMessage && h.onMessage(m); });
    conn.on('close', () => { clearTimeout(timer); if (!closed) h.onClose && h.onClose(); });
    conn.on('error', () => {});
  });
  peer.on('error', (err) => { fail(err.type === 'peer-unavailable' ? 'not-found' : err.type, err); });
  peer.on('disconnected', () => { /* the data connection can stay up without the broker */ });
  return {
    send(msg) { if (conn && conn.open) { try { conn.send(msg); return true; } catch (e) {} } return false; },
    get open() { return !!(conn && conn.open); },
    close() { closed = true; try { if (conn) conn.close(); } catch (e) {} try { peer.destroy(); } catch (e) {} },
  };
}

window.LimpaNet = { host, join, available };
})();
