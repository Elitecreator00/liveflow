// Coda dell'input dell'operatore verso il browser della stanza (ADR-0011).
//
// Ogni Input.dispatch* di CDP viene eseguito dal renderer in ordine, e la
// risposta arriva solo a evento gestito. Il viewer manda fino a 30 movimenti al
// secondo: se il renderer ne smaltisce meno, prima la coda cresceva senza
// limite e un click finiva in fondo, eseguito secondi dopo — "clicco e non
// succede nulla". Qui gli eventi continui si fondono mentre si aspetta:
// - movimenti consecutivi → conta solo l'ultima posizione;
// - rotella consecutiva nello stesso punto → i delta si sommano.
// Click, tasti, testo e navigazione non si fondono mai e restano in ordine.

const isMove = (m) => m?.type === 'mouse' && m.kind === 'move';
const isWheel = (m) => m?.type === 'mouse' && m.kind === 'wheel';

/** Accoda `msg` fondendolo con l'ultimo elemento quando possibile. Muta `queue`. */
export function enqueueInput(queue, msg) {
  const last = queue[queue.length - 1];
  if (isMove(msg) && isMove(last) && last.modifiers === msg.modifiers) {
    queue[queue.length - 1] = msg;
    return queue;
  }
  if (
    isWheel(msg) && isWheel(last) &&
    last.modifiers === msg.modifiers &&
    Math.abs(last.nx - msg.nx) < 0.01 && Math.abs(last.ny - msg.ny) < 0.01
  ) {
    queue[queue.length - 1] = {
      ...last,
      deltaX: (last.deltaX ?? 0) + (msg.deltaX ?? 0),
      deltaY: (last.deltaY ?? 0) + (msg.deltaY ?? 0),
    };
    return queue;
  }
  queue.push(msg);
  return queue;
}

/**
 * Esegue in serie la coda con `handler` (async). Un solo pump alla volta: chi
 * lo chiama mentre è già attivo trova la coda che si svuota da sé.
 */
export function createInputPump(handler) {
  const queue = [];
  let running = false;
  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const msg = queue.shift();
        try {
          await handler(msg);
        } catch {
          /* un evento fallito non deve bloccare i successivi */
        }
      }
    } finally {
      running = false;
    }
  }
  return {
    push(msg) {
      enqueueInput(queue, msg);
      void pump();
    },
    get size() {
      return queue.length;
    },
  };
}
