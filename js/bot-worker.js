/* Limpa's Breakfast: computer players think here, in background threads, so a long think never freezes the game.
   The page keeps a few of these (one per spare processor core). For a move it asks one thread to 'prepare': that thread
   either answers with the move (and the computer's plan for the rest of its turn) or lists the options worth searching.
   Then every thread plays those options out on its own imagined deals ('run') and the page pools the totals.
   'think' does the whole move in this one thread (used when only one thread is available). */
importScripts('engine.js');
const E = self.LimpaEngine;
self.onmessage = (e) => {
  const { id, op, state, seat, thinkMs, lines, ms } = e.data;
  if (thinkMs) E.CFG.smart.expertMs = thinkMs;          // more time here than on the page's own thread
  try {
    if (op === 'prepare') { self.postMessage(Object.assign({ id }, E.prepare(state, seat))); return; }
    if (op === 'run') { self.postMessage({ id, stats: E.runLines(state, seat, lines, ms) }); return; }
    const action = E.botNextAction(state, seat);
    self.postMessage({ id, action, plan: state.finishPlan || null });
  } catch (err) { self.postMessage({ id, action: null, failed: true }); }
};
