// Appunti del browser di stanza (ADR-0011).
//
// Il browser remoto ha i SUOI appunti (selezione CLIPBOARD di X sul display
// Xvfb del container), separati da quelli del PC dell'operatore. Qui li
// leggiamo e scriviamo con xclip dentro il container, così:
// - incolla: il testo dell'operatore va negli appunti remoti e poi si preme
//   Ctrl+V nella pagina → il sito vede un incolla VERO (evento paste incluso);
// - copia: dopo Ctrl+C/Ctrl+X si rileggono gli appunti remoti e si rimandano
//   al viewer, che li scrive in quelli dell'operatore.
// Nessun codice eseguito nella pagina: funziona anche dentro iframe e campi di
// input, esattamente come il copia/incolla nativo.
import { spawn } from 'node:child_process';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 3000;

function run(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = Buffer.alloc(0);
    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error('xclip timeout'));
    }, TIMEOUT_MS);
    p.stdout.on('data', (d) => {
      if (out.length < MAX_BYTES) out = Buffer.concat([out, d]);
    });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.subarray(0, MAX_BYTES).toString('utf8'));
      else reject(new Error(err.trim() || `xclip exit ${code}`));
    });
    p.stdin.on('error', () => undefined);
    p.stdin.end(input ?? '');
  });
}

/** Adattatore appunti per il container `name` (display :99, vedi entrypoint). */
export function containerClipboard(name) {
  const base = ['exec', '-i', '-e', 'DISPLAY=:99', name, 'xclip', '-selection', 'clipboard'];
  return {
    async write(text) {
      // xclip resta in background a "possedere" la selezione finché qualcun
      // altro (es. un Ctrl+C nella pagina) non la prende: è il modello di X.
      // Il processo in background eredita stdout/stderr: se restano collegati,
      // docker exec aspetta che si chiudano e ogni incolla costava ~2,1 s.
      // Staccati → ~90 ms (misurato 29/09/2026).
      await run(
        ['exec', '-i', '-e', 'DISPLAY=:99', name, 'sh', '-c',
          'exec xclip -selection clipboard -i >/dev/null 2>&1'],
        String(text).slice(0, MAX_BYTES),
      );
    },
    async read() {
      try {
        return await run([...base, '-o']);
      } catch (e) {
        // Appunti vuoti: xclip esce con "target STRING not available".
        if (/not available/i.test(String(e.message))) return '';
        throw e;
      }
    },
  };
}

/** Il tasto è una scorciatoia di copia/taglia (Ctrl+C / Ctrl+X, Linux remoto)? */
export function isCopyShortcut(msg) {
  return (
    msg?.type === 'key' &&
    msg.kind !== 'up' &&
    ((msg.modifiers ?? 0) & 2) !== 0 &&
    ['c', 'x'].includes(String(msg.key).toLowerCase())
  );
}
