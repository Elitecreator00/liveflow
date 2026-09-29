// Spike S4 — un vero browser (Chromium via Playwright) fa getUserMedia su
// /dev/video10 e cattura un frame: prova che un SITO riceve la nostra sorgente.
// Gira in container con il device mappato; produce /work/s4-proof.png.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--no-sandbox'],
});
const page = await browser.newPage();
// file:// è un contesto "sicuro" in Chromium → navigator.mediaDevices disponibile
// (con about:blank/setContent sarebbe undefined).
await page.goto('file:///work/getusermedia-test.html');

const result = await page.evaluate(async () => {
  // Primo getUserMedia per sbloccare le label dei device, poi enumera.
  try {
    const s0 = await navigator.mediaDevices.getUserMedia({ video: true });
    s0.getTracks().forEach((t) => t.stop());
  } catch (e) { /* ignore */ }
  const devs = await navigator.mediaDevices.enumerateDevices();
  const labels = devs.filter((d) => d.kind === 'videoinput').map((d) => d.label);

  // Cattura reale dalla webcam virtuale.
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
  const v = document.createElement('video');
  v.srcObject = stream; v.muted = true; v.autoplay = true; v.playsInline = true;
  document.body.appendChild(v);
  v.style.width = '100%';
  await v.play();
  await new Promise((r) => setTimeout(r, 1000));

  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4000) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  return { labels, w: v.videoWidth, h: v.videoHeight, mean: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] };
});

console.log('VIDEO_INPUTS=' + JSON.stringify(result.labels));
console.log('CAPTURED=' + result.w + 'x' + result.h + ' meanRGB=' + JSON.stringify(result.mean));
const black = result.mean[0] + result.mean[1] + result.mean[2] < 12;
console.log('VERDICT=' + (result.w > 0 && !black ? 'PASS (browser riceve video reale dalla webcam virtuale)' : 'FAIL'));

await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: '/work/s4-proof.png' });
await browser.close();
