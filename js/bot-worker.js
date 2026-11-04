/* Limpa's Breakfast: computer players think here, in a background thread, so a long think never freezes the game.
   The page sends a copy of the game and the seat to play; this sends back the move (and the computer's plan for
   the rest of its turn, which it keeps in the game state). */
importScripts('engine.js');
const E = self.LimpaEngine;
self.onmessage = (e) => {
  const { id, state, seat, thinkMs } = e.data;
  if (thinkMs) E.CFG.smart.expertMs = thinkMs;          // more time here than on the page's own thread
  let action = null;
  try { action = E.botNextAction(state, seat); } catch (err) { action = null; }
  self.postMessage({ id, action, plan: state.finishPlan || null });
};
