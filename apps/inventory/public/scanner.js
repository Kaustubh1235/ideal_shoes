/* Camera QR scanning with jsQR. Works over HTTPS (or localhost). Exposes window.Scanner. */
(function () {
  "use strict";
  let stream = null;
  let raf = 0;
  let video = null;
  let onResult = null;
  let lastText = "";
  let lastAt = 0;
  let paused = false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function supported() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.jsQR);
  }

  async function start(videoEl, handler) {
    if (!supported()) throw new Error("Camera scanning needs HTTPS and a browser with camera access.");
    video = videoEl;
    onResult = handler;
    paused = false;
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    tick();
  }

  function tick() {
    if (!video || !stream) return;
    if (!paused && video.readyState >= 2) {
      const w = video.videoWidth, h = video.videoHeight;
      if (w && h) {
        const s = Math.min(1, 720 / Math.max(w, h));
        canvas.width = Math.round(w * s);
        canvas.height = Math.round(h * s);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const r = window.jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        if (r && r.data) {
          const t = Date.now();
          if (r.data !== lastText || t - lastAt > 2500) {
            lastText = r.data;
            lastAt = t;
            if (navigator.vibrate) navigator.vibrate(40);
            onResult && onResult(r.data);
          }
        }
      }
    }
    raf = requestAnimationFrame(tick);
  }

  function pause() { paused = true; }
  function resume() { paused = false; lastText = ""; }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) { video.srcObject = null; }
    video = null;
    onResult = null;
  }

  function active() { return Boolean(stream); }

  function decodeFile(file) {
    return new Promise((resolve, reject) => {
      if (!window.jsQR) { resolve(null); return; }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          for (const max of [800, 1400]) {
            const s = Math.min(1, max / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
            canvas.width = w; canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            const d = ctx.getImageData(0, 0, w, h);
            const r = window.jsQR(d.data, w, h, { inversionAttempts: "attemptBoth" });
            if (r && r.data) { URL.revokeObjectURL(url); resolve(r.data); return; }
          }
          URL.revokeObjectURL(url);
          resolve(null);
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = url;
    });
  }

  window.Scanner = { supported, start, stop, pause, resume, active, decodeFile };
})();
