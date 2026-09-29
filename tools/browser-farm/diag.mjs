// Diagnostica di una stanza: fingerprint visto dalla pagina + webcam/mic
// virtuali (enumerateDevices + getUserMedia). Uso: node diag.mjs <cdpPort>
import { connectCdp } from './cdp.mjs';

const port = Number(process.argv[2] || 9310);
const c = await connectCdp(port);
const { targetInfos } = await c.send('Target.getTargets');
const page = targetInfos.find((t) => t.type === 'page');
if (!page) {
  console.error('nessuna pagina');
  process.exit(1);
}
const { sessionId } = await c.send('Target.attachToTarget', {
  targetId: page.targetId,
  flatten: true,
});

async function ev(expression) {
  const r = await c.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (r.exceptionDetails) return `EXC: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`;
  return r.result.value;
}

console.log('url      :', page.url);
console.log('timezone :', await ev('Intl.DateTimeFormat().resolvedOptions().timeZone'));
console.log('webdriver:', await ev('navigator.webdriver'));
console.log('language :', await ev('navigator.language'), JSON.stringify(await ev('[...navigator.languages]')));
console.log('platform :', await ev('navigator.platform'), '| cores:', await ev('navigator.hardwareConcurrency'));
console.log('UA       :', String(await ev('navigator.userAgent')).slice(0, 90));
console.log(
  'devices  :',
  JSON.stringify(
    await ev(
      'navigator.mediaDevices.enumerateDevices().then(ds => ds.map(d => d.kind + ":" + (d.label || "?")))',
    ),
  ),
);
console.log(
  'gUM      :',
  await ev(
    `navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(s => {
        const t = s.getVideoTracks()[0];
        const st = t.getSettings();
        const out = t.label + ' ' + st.width + 'x' + st.height + '@' + st.frameRate;
        s.getTracks().forEach(x => x.stop());
        return out;
      })
      .catch(e => 'GUM_ERR ' + e.name + ': ' + e.message)`,
  ),
);
process.exit(0);
