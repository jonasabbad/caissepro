import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { codeFromScan } from '@/utils/scanCode';

/**
 * Camera barcode reading (EAN-13 / EAN-8 / UPC / Code 128 / Code 39 / ITF — product, box, IMEI and serial barcodes —
 * and QR codes, whose product code is taken from what they hold: see utils/scanCode.js).
 * Uses the browser's native BarcodeDetector when it has one, otherwise ZXing (@zxing/browser, MIT, loaded on demand).
 * `start()` opens the camera into `video` and calls `onCode(code)` once, then stops the camera; call `start()` again
 * for the next code. The camera needs a secure page (https or localhost); `error` says why it could not start.
 */
const FORMATS_NATIVE = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
const backFirst = (list) => [...list].sort((a, b) => Number(/back|rear|environment|arrière/i.test(b.label)) - Number(/back|rear|environment|arrière/i.test(a.label)));

/** Short beep and vibration when a code is read. */
export function scanFeedback() {
  try {
    navigator.vibrate?.(60);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => ctx.close();
  } catch {
    /* no audio: the result is shown anyway */
  }
}

export function useBarcodeCamera(video, onCode) {
  const status = ref('idle'); // idle | starting | scanning | error
  const error = ref(''); // insecure | denied | nocamera | failed
  const cameras = ref([]);
  const cameraId = ref('');
  let controls = null;
  let stream = null;
  let rafId = 0;
  let done = false;

  function stop() {
    cancelAnimationFrame(rafId);
    try {
      controls?.stop();
    } catch {
      /* already stopped */
    }
    controls = null;
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
    if (video.value) video.value.srcObject = null;
    if (status.value !== 'error') status.value = 'idle';
  }

  function deliver(raw, isQr = false) {
    const code = isQr ? codeFromScan(raw) : String(raw || '').trim();
    if (!code || done) return;
    done = true;
    scanFeedback();
    stop();
    onCode(code);
  }

  async function start() {
    stop();
    done = false;
    error.value = '';
    if (!window.isSecureContext) return ((status.value = 'error'), (error.value = 'insecure'));
    if (!navigator.mediaDevices?.getUserMedia) return ((status.value = 'error'), (error.value = 'nocamera'));
    status.value = 'starting';
    await nextTick();
    try {
      const constraints = { video: cameraId.value ? { deviceId: { exact: cameraId.value } } : { facingMode: { ideal: 'environment' } }, audio: false };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Camera names are only readable once permission is granted.
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      cameras.value = backFirst(devices);
      if (!cameraId.value) cameraId.value = stream.getVideoTracks()[0]?.getSettings?.().deviceId || cameras.value[0]?.deviceId || '';
      video.value.srcObject = stream;
      await video.value.play();
      status.value = 'scanning';
      if ('BarcodeDetector' in window) {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const detector = new window.BarcodeDetector({ formats: FORMATS_NATIVE.filter((f) => supported.includes(f)) });
        const tick = async () => {
          if (!stream || done) return;
          try {
            const found = await detector.detect(video.value);
            if (found[0]?.rawValue) return deliver(found[0].rawValue, found[0].format === 'qr_code');
          } catch {
            /* frame not ready */
          }
          rafId = requestAnimationFrame(tick);
        };
        tick();
      } else {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
        const hints = new Map([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.QR_CODE],
          ],
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        controls = await reader.decodeFromStream(stream, video.value, (result) => result && deliver(result.getText(), result.getBarcodeFormat() === BarcodeFormat.QR_CODE));
      }
    } catch (e) {
      stop();
      status.value = 'error';
      error.value = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'nocamera' : 'failed';
    }
  }

  /** A code typed or sent by a USB / Bluetooth scanner, with the same feedback and once-only rule. */
  const submit = (code) => deliver(code);

  watch(cameraId, (id, old) => old && id && id !== old && status.value === 'scanning' && start());
  onBeforeUnmount(stop);
  return { status, error, cameras, cameraId, start, stop, submit };
}
