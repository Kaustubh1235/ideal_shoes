/* Stock Room client. Plain JS, no build step. Talks to /api/v1, works offline for scans. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtN = new Intl.NumberFormat("en-IN");
  const rupee = (n) => "₹" + fmtN.format(Math.round(n || 0));
  const DAY = 86400000;
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—");
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "");
  const ageDays = (it) => Math.max(0, Math.floor((Date.now() - Date.parse(it.lastIn || it.createdAt)) / DAY));
  const isDead = (it) => it.qty > 0 && ageDays(it) >= 180 && (!it.lastOut || (Date.now() - Date.parse(it.lastOut)) / DAY >= 180);
  const catName = { boot: "Boots", shoe: "Shoes", jacket: "Jackets", bag: "Bags", belt: "Belts & wallets", other: "Other" };
  const SIZED = ["boot", "shoe", "jacket", "belt"];
  const code = (s, n) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, n);
  const skuPrefix = (b, a, c) => [code(b, 4), code(a, 8), code(c, 3)].filter(Boolean).join("-");
  const normalizeSku = (t) => { t = String(t || "").trim(); const i = t.lastIndexOf("#"); if (i >= 0) t = t.slice(i + 1); return t.toUpperCase().replace(/[^A-Z0-9-]/g, ""); };

  const S = { me: null, settings: { shop: "Ideal Shoes", appUrl: "", sizeRuns: {}, categories: ["boot", "shoe", "jacket", "bag", "belt", "other"], llm: { provider: "none" } }, items: new Map(), moves: [], view: "scan", openSku: null, selected: new Set(), dash: null, online: navigator.onLine, pending: [], fromScan: false };

  // ---------- toast ----------
  let toastT;
  function toast(msg, ms = 2200) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }

  // ---------- api ----------
  async function api(method, path, body, raw) {
    const headers = { "x-requested-with": "StockRoom" };
    if (body !== undefined && !raw) headers["content-type"] = "application/json";
    if (raw) headers["content-type"] = raw;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), credentials: "same-origin" });
    } catch (e) {
      const err = new Error("No connection"); err.network = true; throw err;
    }
    setOnline(true);
    if (res.status === 401 && !path.startsWith("/api/v1/auth/")) { showGate(); const err = new Error("Please sign in again"); err.auth = true; throw err; }
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
    if (!res.ok) { const err = new Error((data && data.error) || `Error ${res.status}`); err.status = res.status; throw err; }
    return data;
  }

  function setOnline(on) {
    S.online = on;
    $("netDot").className = "dot " + (on ? "on" : "off");
    $("netText").textContent = on ? "Live" : "Offline";
    $("offlineNotice").hidden = on;
  }
  window.addEventListener("online", () => { setOnline(true); flushQueue(); });
  window.addEventListener("offline", () => setOnline(false));

  // ---------- offline queue ----------
  function loadQueue() { try { S.pending = JSON.parse(localStorage.getItem("sr.queue") || "[]"); } catch { S.pending = []; } renderQueue(); }
  function saveQueue() { try { localStorage.setItem("sr.queue", JSON.stringify(S.pending)); } catch {} renderQueue(); }
  function renderQueue() { const b = $("queueBadge"); b.hidden = S.pending.length === 0; b.textContent = String(S.pending.length); }
  let flushing = false;
  async function flushQueue() {
    if (flushing || !S.pending.length) return;
    flushing = true;
    try {
      while (S.pending.length) {
        const m = S.pending[0];
        try {
          await api("POST", "/api/v1/movements", m);
          S.pending.shift(); saveQueue();
        } catch (e) {
          if (e.network) break;
          // Server rejected it (e.g. SKU deleted). Drop it and tell the user.
          S.pending.shift(); saveQueue();
          toast("Couldn't sync one change: " + e.message, 4000);
        }
      }
      if (!S.pending.length) await refresh();
    } finally { flushing = false; }
  }

  // ---------- gate ----------
  let pinUser = null, pin = "";
  async function showGate() {
    $("app").hidden = true; $("gate").hidden = false;
    ["gate-setup", "gate-login", "gate-pin"].forEach((id) => { $(id).hidden = true; });
    $("gate-wait").hidden = false;
    try {
      const st = await api("GET", "/api/v1/auth/state");
      $("gate-wait").hidden = true;
      $("gateVer").textContent = st.version ? "v" + st.version : "";
      if (st.me) { S.me = st.me; await boot(); return; }
      if (st.setupNeeded) { $("gate-setup").hidden = false; $("setupName").focus(); return; }
      $("loginShop").textContent = st.shop || "Ideal Shoes";
      $("people").innerHTML = st.users.map((u) => `<button type="button" data-id="${esc(u.id)}" data-name="${esc(u.name)}">${esc(u.name)}<small>${u.role === "admin" ? "admin" : "staff"}</small></button>`).join("");
      $("gate-login").hidden = false;
    } catch (e) {
      $("gate-wait").hidden = false; $("gate-wait").innerHTML = `<p class="muted">Can't reach the server. ${esc(e.message)}</p><button type="button" class="btn" id="retryGate">Retry</button>`;
      $("retryGate").addEventListener("click", showGate);
    }
  }
  $("people").addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (!b) return; pinUser = { id: b.dataset.id, name: b.dataset.name }; pin = ""; $("pinWho").textContent = pinUser.name; $("pinMsg").hidden = true; $("gate-login").hidden = true; $("gate-pin").hidden = false; renderPin(); });
  $("pinBack").addEventListener("click", () => { $("gate-pin").hidden = true; $("gate-login").hidden = false; });
  function renderPin() { $("pindots").innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<i class="${i < pin.length ? "on" : ""}"></i>`).join(""); }
  (function buildPad() { const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"]; $("pinpad").innerHTML = keys.map((k) => `<button type="button" data-k="${k}" class="${k === "⌫" || k === "OK" ? "alt" : ""}">${k}</button>`).join(""); })();
  $("pinpad").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-k]"); if (!b) return; const k = b.dataset.k;
    if (k === "⌫") pin = pin.slice(0, -1); else if (k === "OK") { await submitPin(); return; } else if (pin.length < 8) pin += k;
    renderPin();
    if (pin.length >= 4 && k !== "⌫") { /* auto-submit at 4 only if the user stops typing */ clearTimeout(window.__pinT); window.__pinT = setTimeout(submitPin, pin.length >= 6 ? 0 : 500); }
  });
  document.addEventListener("keydown", (e) => { if ($("gate-pin").hidden || $("gate").hidden) return; if (/^[0-9]$/.test(e.key) && pin.length < 8) { pin += e.key; renderPin(); } else if (e.key === "Backspace") { pin = pin.slice(0, -1); renderPin(); } else if (e.key === "Enter") submitPin(); });
  async function submitPin() {
    clearTimeout(window.__pinT);
    if (!pinUser || pin.length < 4) return;
    try { const r = await api("POST", "/api/v1/auth/login", { userId: pinUser.id, pin }); S.me = r.me; pin = ""; await boot(); }
    catch (e) { pin = ""; renderPin(); $("pinMsg").hidden = false; $("pinMsg").textContent = e.message; if (navigator.vibrate) navigator.vibrate([60, 40, 60]); }
  }
  $("setupGo").addEventListener("click", async () => {
    const name = $("setupName").value.trim(), p1 = $("setupPin").value.trim(), p2 = $("setupPin2").value.trim();
    const msg = $("setupMsg"); msg.hidden = true;
    if (!name) { msg.hidden = false; msg.textContent = "Enter your name."; return; }
    if (!/^[0-9]{4,8}$/.test(p1)) { msg.hidden = false; msg.textContent = "PIN must be 4 to 8 digits."; return; }
    if (p1 !== p2) { msg.hidden = false; msg.textContent = "The two PINs don't match."; return; }
    try { const r = await api("POST", "/api/v1/auth/setup", { name, pin: p1, shop: $("setupShop").value.trim(), appUrl: location.origin }); S.me = r.me; await boot(); }
    catch (e) { msg.hidden = false; msg.textContent = e.message; }
  });
  $("logoutBtn").addEventListener("click", async () => { try { await api("POST", "/api/v1/auth/logout"); } catch {} S.me = null; Scanner.stop(); showGate(); });

  // ---------- boot ----------
  async function boot() {
    const b = await api("GET", "/api/v1/bootstrap");
    S.me = b.me; S.settings = b.settings;
    S.items = new Map(b.items.map((i) => [i.sku, i])); S.moves = b.movements;
    $("gate").hidden = true; $("app").hidden = false;
    $("shopName").textContent = S.settings.shop; $("meName").textContent = S.me.name; $("appVer").textContent = b.version ? "v" + b.version : "";
    document.title = `${S.settings.shop} · Stock Room`;
    $("tab-admin-li").hidden = S.me.role !== "admin";
    fillCats();
    loadQueue();
    let v = null; try { v = localStorage.getItem("sr.view"); } catch {}
    show(v && v !== "admin" ? v : "scan");
    const h = (location.hash || "").slice(1);
    if (h) openCode(h);
    flushQueue();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  async function refresh() {
    try { const b = await api("GET", "/api/v1/bootstrap"); S.settings = b.settings; S.items = new Map(b.items.map((i) => [i.sku, i])); S.moves = b.movements; render(); } catch (e) { if (e.network) setOnline(false); }
  }
  setInterval(() => { if (!document.hidden && S.me && !$("app").hidden && S.view !== "dash") refresh(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.me) { refresh(); flushQueue(); } });
  window.addEventListener("hashchange", () => { const h = (location.hash || "").slice(1); if (h && S.me) openCode(h); });

  // ---------- views ----------
  const VIEWS = ["scan", "stock", "add", "labels", "dash", "admin"];
  function show(view) {
    if (view === "admin" && (!S.me || S.me.role !== "admin")) view = "scan";
    S.view = VIEWS.includes(view) ? view : "scan";
    VIEWS.forEach((v) => { $("view-" + v).hidden = v !== S.view; });
    document.querySelectorAll("nav.tabs button").forEach((b) => { if (b.dataset.view === S.view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    try { localStorage.setItem("sr.view", S.view); } catch {}
    if (S.view !== "scan" && Scanner.active()) stopScan();
    render();
    if (S.view === "dash") loadDash();
    if (S.view === "admin") loadAdmin();
    window.scrollTo({ top: 0 });
  }
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b && !b.closest("nav") && b.tagName === "BUTTON") show(b.dataset.view); });
  document.querySelectorAll("nav.tabs button[data-view]").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

  const item = (sku) => S.items.get(sku) || null;
  const itemName = (it) => [it.brand, it.article, it.colour].filter(Boolean).join(" · ");
  const sizeText = (it) => (it.size && it.size !== "-" ? it.size : "—");
  const brands = () => [...new Set([...S.items.values()].map((i) => i.brand))].sort();
  const locs = () => [...new Set([...S.items.values()].map((i) => i.loc).filter(Boolean))].sort();
  function fillSelect(sel, values, first) { const cur = sel.value; sel.innerHTML = first + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join(""); sel.value = values.includes(cur) ? cur : ""; }
  function fillCats() {
    const cats = S.settings.categories || Object.keys(catName);
    $("aCat").innerHTML = cats.map((c) => `<option value="${c}">${catName[c] || c}</option>`).join("");
    $("fCat").innerHTML = '<option value="">All types</option>' + cats.map((c) => `<option value="${c}">${catName[c] || c}</option>`).join("");
    onCatChange();
  }
  function render() {
    const bs = brands();
    fillSelect($("fBrand"), bs, '<option value="">All brands</option>'); fillSelect($("lBrand"), bs, '<option value="">All brands</option>');
    $("brandList").innerHTML = bs.map((b) => `<option value="${esc(b)}">`).join(""); $("locList").innerHTML = locs().map((l) => `<option value="${esc(l)}">`).join("");
    $("scanCount").textContent = S.items.size ? `${S.items.size} SKUs on file` : "";
    renderMoves($("scanRecent"), S.moves.slice(0, 8), true);
    if (S.view === "stock") renderStock();
    if (S.view === "labels") renderLabels();
    if (S.openSku) renderSheet();
  }

  // ---------- movements ----------
  function applyLocal(m) {
    const it = item(m.sku); if (!it) return null;
    const before = it.qty; let after;
    if (m.type === "count") after = Math.max(0, m.counted | 0);
    else { let d = m.delta | 0; if (m.type === "out" && d > 0) d = -d; if (m.type === "in" && d < 0) d = -d; after = Math.max(0, before + d); }
    const delta = after - before; const t = new Date().toISOString();
    const next = { ...it, qty: after, updatedAt: t };
    if (m.type === "count") next.lastCount = t; else if (delta > 0) next.lastIn = t; else if (delta < 0) next.lastOut = t;
    S.items.set(m.sku, next);
    const mv = { id: m.id, sku: m.sku, type: m.type, delta, before, after, note: m.note || (m.type === "count" ? "Count" : m.type === "out" ? "Sold" : "Stock in"), by: S.me && S.me.userId, at: t, pending: true };
    S.moves.unshift(mv);
    if (S.sheetMoves && S.openSku === m.sku) S.sheetMoves.unshift(mv);
    return next;
  }
  function replaceMove(id, real) {
    for (const list of [S.moves, S.sheetMoves]) { if (!list) continue; const i = list.findIndex((x) => x.id === id); if (i >= 0) list[i] = real; }
  }
  async function move(input) {
    const it = item(input.sku); if (!it) { toast("Unknown item"); return; }
    if (input.type === "out" && it.qty <= 0) { toast("Already at 0"); return; }
    const m = { id: crypto.randomUUID(), ...input };
    applyLocal(m); render();
    try {
      const r = await api("POST", "/api/v1/movements", m);
      S.items.set(r.item.sku, r.item);
      replaceMove(m.id, r.movement);
      render();
      toast(`${m.type === "out" ? "Sold" : m.type === "in" ? "In" : "Counted"} · ${m.sku} → ${r.item.qty}`);
    } catch (e) {
      if (e.network) { S.pending.push(m); saveQueue(); setOnline(false); toast("Saved on this phone. Will sync when online.", 3000); }
      else if (!e.auth) { toast(e.message, 3500); await refresh(); }
    }
  }

  // ---------- scan ----------
  async function startScan() {
    try {
      $("scanIdle").hidden = true; $("scanVideo").hidden = false; $("scanReticle").hidden = false; $("scanHint").hidden = false; $("scanStop").hidden = false;
      await Scanner.start($("scanVideo"), (text) => { Scanner.pause(); S.fromScan = true; openCode(text); });
    } catch (e) {
      stopScan();
      const msg = $("scanMsg"); msg.hidden = false; msg.className = "notice bad";
      msg.textContent = /denied|permission/i.test(e.message) ? "Camera permission was refused. Allow camera for this site in the browser settings, or use 'Photo of label'." : e.message;
    }
  }
  function stopScan() { Scanner.stop(); $("scanIdle").hidden = false; $("scanVideo").hidden = true; $("scanReticle").hidden = true; $("scanHint").hidden = true; $("scanStop").hidden = true; }
  $("scanStart").addEventListener("click", startScan);
  $("scanStop").addEventListener("click", stopScan);
  $("scanFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    const msg = $("scanMsg"); msg.hidden = false; msg.className = "notice"; msg.textContent = "Reading the code…";
    try { const text = await Scanner.decodeFile(f); if (!text) { msg.textContent = "Couldn't read a QR code in that photo. Fill the frame with the label in good light, or type the code."; return; } msg.hidden = true; openCode(text); }
    catch { msg.textContent = "Couldn't read that photo."; }
  });
  function openCode(text) {
    const sku = normalizeSku(text); if (!sku) return;
    if (item(sku)) { $("scanMsg").hidden = true; openSheet(sku); return; }
    if (S.view !== "scan") { toast(`No item with code ${sku}`, 3500); return; }
    const msg = $("scanMsg"); msg.hidden = false; msg.className = "notice"; msg.textContent = `No item with code ${sku}. Add it under Add, then print its label.`;
    $("codeInput").value = sku; if (Scanner.active()) Scanner.resume();
  }
  $("codeGo").addEventListener("click", () => openCode($("codeInput").value));
  $("codeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); openCode($("codeInput").value); } });

  // ---------- counter barcode scanner ----------
  // A USB "keyboard wedge" scanner types the code a few ms per key and ends with Enter.
  // When no field has focus, collect those fast keys and open the item. People type far slower, so they never trigger it.
  let wedge = "", wedgeAt = 0;
  document.addEventListener("keydown", (e) => {
    if (!S.me || $("app").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    if (e.timeStamp - wedgeAt > 60) wedge = "";
    if (e.key === "Enter") {
      if (wedge.length >= 3) { e.preventDefault(); const c = wedge; wedge = ""; openCode(c); }
      wedge = ""; return;
    }
    if (e.key.length !== 1) return; // Shift and friends
    wedge += e.key; wedgeAt = e.timeStamp;
  });

  // ---------- sheet ----------
  function openSheet(sku) {
    S.openSku = sku; $("sheet").hidden = false; $("sheetBackdrop").hidden = false;
    ["shCountBox", "shMoreBox", "shEditBox", "delConfirm"].forEach((id) => { $(id).hidden = true; }); $("delRow").hidden = false;
    $("shNext").hidden = !S.fromScan;
    renderSheet();
    api("GET", `/api/v1/items/${encodeURIComponent(sku)}`).then((r) => { if (S.openSku === sku) { S.items.set(sku, r.item); S.sheetMoves = r.movements; renderSheet(); } }).catch(() => {});
  }
  function closeSheet() { S.openSku = null; S.sheetMoves = null; $("sheet").hidden = true; $("sheetBackdrop").hidden = true; if (S.fromScan && Scanner.active()) Scanner.resume(); S.fromScan = false; }
  $("shClose").addEventListener("click", closeSheet); $("sheetBackdrop").addEventListener("click", closeSheet); $("shNext").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.openSku) closeSheet(); });
  $("shOut").addEventListener("click", () => move({ sku: S.openSku, type: "out", delta: -1, note: "Sold" }));
  $("shIn").addEventListener("click", () => move({ sku: S.openSku, type: "in", delta: 1, note: "Stock in" }));
  $("shCount").addEventListener("click", () => { const it = item(S.openSku); $("shCountVal").value = it ? it.qty : 0; $("shCountBox").hidden = false; $("shCountVal").focus(); $("shCountVal").select(); });
  $("shCountCancel").addEventListener("click", () => { $("shCountBox").hidden = true; });
  $("shCountSave").addEventListener("click", async () => { const v = parseInt($("shCountVal").value, 10); if (isNaN(v) || v < 0) { toast("Enter the number counted"); return; } $("shCountBox").hidden = true; await move({ sku: S.openSku, type: "count", counted: v }); });
  $("shMore").addEventListener("click", () => { $("shMoreBox").hidden = !$("shMoreBox").hidden; $("shEditBox").hidden = true; });
  $("shDeltaSave").addEventListener("click", async () => { const d = parseInt($("shDelta").value, 10); if (!d) { toast("Enter a + or − number"); return; } const note = $("shNote").value.trim(); $("shDelta").value = ""; $("shNote").value = ""; $("shMoreBox").hidden = true; await move({ sku: S.openSku, type: d > 0 ? "in" : "out", delta: d, note }); });
  $("shEdit").addEventListener("click", () => { const it = item(S.openSku); if (!it) return; $("eCost").value = it.cost || ""; $("eMrp").value = it.mrp || ""; $("eLoc").value = it.loc || ""; $("shEditBox").hidden = !$("shEditBox").hidden; $("shMoreBox").hidden = true; });
  $("eSave").addEventListener("click", async () => { try { const r = await api("PATCH", `/api/v1/items/${encodeURIComponent(S.openSku)}`, { cost: +$("eCost").value || 0, mrp: +$("eMrp").value || 0, loc: $("eLoc").value.trim() }); S.items.set(r.item.sku, r.item); $("shEditBox").hidden = true; toast("Saved"); render(); } catch (e) { toast(e.message); } });
  $("eDelete").addEventListener("click", () => { $("delRow").hidden = true; $("delConfirm").hidden = false; });
  $("eDeleteNo").addEventListener("click", () => { $("delRow").hidden = false; $("delConfirm").hidden = true; });
  $("eDeleteYes").addEventListener("click", async () => { const sku = S.openSku; try { await api("DELETE", `/api/v1/items/${encodeURIComponent(sku)}`); S.items.delete(sku); closeSheet(); toast("Deleted " + sku); await refresh(); } catch (e) { toast(e.message); } });
  function renderSheet() {
    const it = item(S.openSku); if (!it) { closeSheet(); return; }
    $("shSku").textContent = it.sku; $("shName").textContent = itemName(it);
    $("shMeta").textContent = `${catName[it.cat] || "Item"}${it.size && it.size !== "-" ? " · Size " + it.size : ""} · ${ageDays(it)} days on rack`;
    $("shQty").textContent = it.qty; $("shLoc").textContent = it.loc ? "Rack: " + it.loc : "";
    $("shPrice").textContent = `${it.cost ? rupee(it.cost) : "—"} / ${it.mrp ? rupee(it.mrp) : "—"}`;
    $("shLastIn").textContent = fmtDate(it.lastIn || it.createdAt); $("shLastOut").textContent = fmtDate(it.lastOut); $("shLastCount").textContent = fmtDate(it.lastCount);
    const admin = S.me && S.me.role === "admin"; $("shEdit").hidden = !admin;
    renderMoves($("shMoves"), (S.sheetMoves || S.moves.filter((m) => m.sku === it.sku)).slice(0, 20), false);
  }
  function renderMoves(ul, moves, withSku) {
    if (!moves.length) { ul.innerHTML = '<li class="one muted small">No entries yet</li>'; return; }
    ul.innerHTML = moves.map((m) => `<li><span class="mv ${m.type === "count" ? "count" : m.delta < 0 ? "out" : "in"}">${m.type === "count" ? "count" : (m.delta > 0 ? "+" : "") + m.delta}</span><span>${withSku ? `<span class="mono small">${esc(m.sku)}</span> ` : ""}${esc(m.note || m.type)}${m.pending ? ' <span class="muted">· waiting to sync</span>' : ""}</span><span class="muted small num">${esc(fmtDate(m.at))} ${esc(fmtTime(m.at))}</span></li>`).join("");
  }
  $("scanRecent").addEventListener("click", (e) => { const li = e.target.closest("li"); if (!li) return; const m = S.moves.slice(0, 8)[[...li.parentNode.children].indexOf(li)]; if (m && item(m.sku)) openSheet(m.sku); });

  // ---------- stock ----------
  function filteredItems() {
    const q = $("q").value.trim().toLowerCase(), b = $("fBrand").value, c = $("fCat").value, sort = $("fSort").value;
    const arr = [...S.items.values()].filter((it) => (!b || it.brand === b) && (!c || it.cat === c) && (!q || `${it.sku} ${itemName(it)} ${it.loc || ""}`.toLowerCase().includes(q)));
    const sz = (it) => parseFloat(it.size) || 0;
    if (sort === "qtyAsc") arr.sort((a, b2) => a.qty - b2.qty || a.sku.localeCompare(b2.sku));
    else if (sort === "ageDesc") arr.sort((a, b2) => ageDays(b2) - ageDays(a));
    else if (sort === "valueDesc") arr.sort((a, b2) => b2.qty * b2.cost - a.qty * a.cost);
    else arr.sort((a, b2) => a.brand.localeCompare(b2.brand) || a.article.localeCompare(b2.article) || a.colour.localeCompare(b2.colour) || sz(a) - sz(b2) || a.sku.localeCompare(b2.sku));
    return arr;
  }
  ["q", "fBrand", "fCat", "fSort"].forEach((id) => $(id).addEventListener("input", renderStock));
  const qtyPill = (it) => `<span class="pill ${it.qty === 0 ? "zero" : it.qty <= 1 ? "low" : "ok"}">${it.qty}</span>`;
  function renderStock() {
    const arr = filteredItems();
    $("stockEmpty").hidden = S.items.size > 0; $("stockTable").hidden = S.items.size === 0;
    let units = 0, value = 0; arr.forEach((it) => { units += it.qty; value += it.qty * (it.cost || 0); });
    $("stockSummary").textContent = `${arr.length} SKUs · ${fmtN.format(units)} units · ${rupee(value)} at cost`;
    $("stockRows").innerHTML = arr.slice(0, 800).map((it) => `<tr class="row" data-sku="${esc(it.sku)}"><td class="mono small">${esc(it.sku)}</td><td>${esc(itemName(it))}</td><td>${esc(sizeText(it))}</td><td class="r">${qtyPill(it)}</td><td class="r">${ageDays(it)}d${isDead(it) ? ' <span class="pill dead">dead</span>' : ""}</td><td class="r">${it.cost ? rupee(it.qty * it.cost) : "—"}</td><td>${esc(it.loc || "")}</td></tr>`).join("");
  }
  $("stockRows").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-sku]"); if (tr) openSheet(tr.dataset.sku); });

  // ---------- add ----------
  function runFor(cat) { return (S.settings.sizeRuns && S.settings.sizeRuns[cat]) || []; }
  function onCatChange() { const cat = $("aCat").value; const sized = SIZED.includes(cat) && runFor(cat).length; $("sizeBlock").hidden = !sized; $("qtyBlock").hidden = !!sized; if (sized) buildSizes(runFor(cat)); previewAdd(); }
  function buildSizes(list) { $("sizerun").innerHTML = list.map((s) => `<label class="s"><b>${esc(s)}</b><input type="number" min="0" step="1" inputmode="numeric" data-size="${esc(s)}" placeholder="0"></label>`).join(""); }
  $("aCat").addEventListener("change", onCatChange);
  $("sizesClear").addEventListener("click", () => { $("sizerun").querySelectorAll("input").forEach((i) => { i.value = ""; }); previewAdd(); });
  ["aBrand", "aArticle", "aColour", "aQty"].forEach((id) => $(id).addEventListener("input", previewAdd));
  $("sizerun").addEventListener("input", previewAdd);
  function addRows() {
    const base = { brand: $("aBrand").value.trim(), article: $("aArticle").value.trim(), colour: $("aColour").value.trim(), cat: $("aCat").value, cost: +$("aCost").value || 0, mrp: +$("aMrp").value || 0, loc: $("aLoc").value.trim() };
    const rows = [];
    if (!$("sizeBlock").hidden) $("sizerun").querySelectorAll("input").forEach((i) => { const q = parseInt(i.value, 10); if (q > 0) rows.push({ ...base, size: i.dataset.size, qty: q }); });
    else { const q = parseInt($("aQty").value, 10); if (!isNaN(q) && q >= 0) rows.push({ ...base, size: "-", qty: q }); }
    return rows;
  }
  function previewAdd() { $("aSkuPrefix").value = skuPrefix($("aBrand").value, $("aArticle").value, $("aColour").value); const rows = addRows(); const units = rows.reduce((a, r) => a + r.qty, 0); $("addPreview").textContent = rows.length ? `${rows.length} SKU${rows.length > 1 ? "s" : ""}, ${units} units` : ""; }
  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const rows = addRows(); if (!rows.length) { toast("Enter at least one quantity"); return; }
    $("addSubmit").disabled = true;
    try {
      const r = await api("POST", "/api/v1/items", { rows });
      r.results.forEach((x) => { S.items.set(x.item.sku, x.item); S.moves.unshift(x.movement); });
      const added = r.results.filter((x) => x.movement.type === "new").length;
      toast(`${added ? added + " new" : ""}${added && r.results.length - added ? ", " : ""}${r.results.length - added ? r.results.length - added + " topped up" : ""}`);
      ["aArticle", "aColour", "aCost", "aMrp"].forEach((id) => { $(id).value = ""; }); $("sizerun").querySelectorAll("input").forEach((i) => { i.value = ""; }); $("aQty").value = "1"; previewAdd(); $("aArticle").focus();
      render();
    } catch (err) { toast(err.network ? "No connection. Adding new stock needs the server; try again when online." : err.message, 3500); }
    $("addSubmit").disabled = false;
  });

  // ---------- labels ----------
  const labelItems = () => { const b = $("lBrand").value, q = $("lq").value.trim().toLowerCase(); return [...S.items.values()].filter((it) => (!b || it.brand === b) && (!q || itemName(it).toLowerCase().includes(q))).sort((a, c) => a.sku.localeCompare(c.sku)); };
  const copiesFor = (it) => { const m = $("lCopies").value; return m === "qty" ? Math.max(0, it.qty) : parseInt(m, 10); };
  const qrText = (sku) => (S.settings.appUrl ? S.settings.appUrl.replace(/#.*$/, "").replace(/\/+$/, "") + "/#" + sku : sku);
  function qrSvg(text) { try { const qr = window.qrcode(0, "M"); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); } catch { return ""; } }
  const labelHtml = (it, cls) => `<div class="${cls}">${qrSvg(qrText(it.sku))}<div><div class="b">${esc(it.brand)}</div><div class="a">${esc(it.article)} · ${esc(it.colour)}</div><div class="z">${esc(it.size && it.size !== "-" ? it.size : catName[it.cat] || "")}</div><div class="k">${esc(it.sku)}</div></div></div>`;
  ["lBrand", "lq", "lCopies"].forEach((id) => $(id).addEventListener("input", renderLabels));
  $("lAll").addEventListener("click", () => { labelItems().forEach((it) => S.selected.add(it.sku)); renderLabels(); });
  $("lNone").addEventListener("click", () => { S.selected.clear(); renderLabels(); });
  $("lRows").addEventListener("change", (e) => { const cb = e.target.closest("input[data-sku]"); if (!cb) return; if (cb.checked) S.selected.add(cb.dataset.sku); else S.selected.delete(cb.dataset.sku); renderLabels(); });
  function renderLabels() {
    const arr = labelItems();
    $("lRows").innerHTML = arr.slice(0, 600).map((it) => `<tr><td><input type="checkbox" data-sku="${esc(it.sku)}" ${S.selected.has(it.sku) ? "checked" : ""} aria-label="Select ${esc(it.sku)}"></td><td class="mono small">${esc(it.sku)}</td><td>${esc(itemName(it))}</td><td>${esc(sizeText(it))}</td><td class="r">${it.qty}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No items match</td></tr>';
    const sel = [...S.selected].map(item).filter(Boolean); const total = sel.reduce((a, it) => a + copiesFor(it), 0);
    $("lCount").textContent = sel.length ? `${sel.length} SKUs · ${total} labels · ${Math.ceil(total / 36)} sheet${total > 36 ? "s" : ""}` : "Nothing selected";
    $("lPreview").innerHTML = sel.slice(0, 12).map((it) => labelHtml(it, "lbl")).join("") || '<p class="muted small" style="margin:0">Tick items above to preview their labels.</p>';
    const msg = $("lMsg"); if (!S.settings.appUrl) { msg.hidden = false; msg.textContent = "Tip: set this app's address in Admin → Settings so the phone's own camera app can open an item from its label."; } else msg.hidden = true;
  }
  $("lPrint").addEventListener("click", () => {
    const sel = [...S.selected].map(item).filter(Boolean); if (!sel.length) { toast("Select items first"); return; }
    const labels = []; sel.forEach((it) => { for (let i = 0; i < copiesFor(it); i++) labels.push(it); });
    if (!labels.length) { toast("Selected items have 0 stock. Choose '1 label per SKU'."); return; }
    if (labels.length > 1080) { toast("Max 1,080 labels (30 sheets) at once."); return; }
    $("print-sheet").innerHTML = labels.map((it) => labelHtml(it, "plbl")).join("");
    setTimeout(() => window.print(), 50);
  });

  // ---------- dashboard ----------
  $("dashDays").addEventListener("change", loadDash);
  async function loadDash() {
    try {
      const d = await api("GET", `/api/v1/reports/dashboard?days=${$("dashDays").value}`); S.dash = d; renderDash(d);
      const ins = await api("GET", "/api/v1/insights"); renderInsights(ins);
      api("GET", "/api/v1/reports/digest").then((dg) => { $("digestPre").textContent = JSON.stringify(dg, null, 2); }).catch(() => {});
    } catch (e) { if (!e.auth) toast(e.message); }
  }
  function renderDash(d) {
    const s = d.summary;
    $("dashAsOf").textContent = "as of " + fmtTime(d.asOf) + ", " + fmtDate(d.asOf);
    $("dashTiles").innerHTML = [
      { l: "Units in stock", v: fmtN.format(s.units), sub: `${s.skus} SKUs` },
      { l: "Stock at cost", v: rupee(s.valueAtCost), sub: `retail ${rupee(s.retailValue)}` },
      { l: "Sold, last " + d.days + " days", v: fmtN.format(d.trend.reduce((a, x) => a + x.sold, 0)), sub: `${fmtN.format(d.trend.reduce((a, x) => a + x.received, 0))} received` },
      { l: "Dead stock · 180+ days", v: rupee(s.deadValue), sub: `${fmtN.format(s.deadUnits)} units · ${s.zeroStockSkus} SKUs at zero`, alert: s.deadValue > 0 },
    ].map((t) => `<div class="tile ${t.alert ? "alert" : ""}"><div class="label">${t.l}</div><div class="v">${t.v}</div><div class="sub">${esc(t.sub)}</div></div>`).join("");
    $("chTrend").innerHTML = Charts.dailyBars(d.trend);
    $("chAge").innerHTML = Charts.hBars(d.ageing.map((b) => ({ name: b.name, value: b.value, sub: `${fmtN.format(b.units)} units` })), { money: true });
    $("dashMovers").innerHTML = d.topMovers.map((m) => `<tr class="row" data-sku="${esc(m.sku)}"><td class="wrap">${esc(m.name)}</td><td class="r">${m.sold}</td><td class="r">${m.qty === 0 ? '<span class="pill zero">0</span>' : m.qty}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Nothing sold yet in this window</td></tr>';
    $("dashGaps").innerHTML = d.sizeGaps.map((g) => `<tr><td class="wrap">${esc(g.brand)} ${esc(g.article)} · ${esc(g.colour)}</td><td class="wrap">${g.missing.map((s) => `<span class="pill zero">${esc(s)}</span>`).join(" ")}</td><td class="r">${g.sold30}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Every selling article has its full size run. Good.</td></tr>';
    $("dashBrands").innerHTML = d.byBrand.map((b) => `<tr><td>${esc(b.brand)}</td><td class="r">${b.skus}</td><td class="r">${fmtN.format(b.units)}</td><td class="r">${rupee(b.value)}</td><td class="r">${b.deadValue ? rupee(b.deadValue) : "—"}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No stock yet</td></tr>';
    $("dashDead").innerHTML = d.dead.map((it) => `<tr class="row" data-sku="${esc(it.sku)}"><td class="wrap">${esc(itemName(it))} ${esc(sizeText(it))}</td><td class="r">${it.qty}</td><td class="r">${it.ageDays}</td><td class="r">${rupee(it.value)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Nothing has sat for 180 days.</td></tr>';
  }
  document.querySelectorAll("#dashMovers, #dashDead").forEach((el) => el.addEventListener("click", (e) => { const tr = e.target.closest("tr[data-sku]"); if (tr && item(tr.dataset.sku)) openSheet(tr.dataset.sku); }));
  const CHIPS = ["What should go on the clearance rack this week?", "Which selling articles are missing sizes?", "Which brand is tying up the most money for the least sales?", "What should we reorder before the wedding season?"];
  $("askChips").innerHTML = CHIPS.map((c) => `<button type="button">${esc(c)}</button>`).join("");
  $("askChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { $("askQ").value = b.textContent; $("askQ").focus(); } });
  function renderInsights(ins) {
    const off = !ins.llm || ins.llm.provider === "none" || !ins.llm.hasKey;
    $("askUnset").hidden = !off; $("askGo").disabled = off;
    $("askHistory").innerHTML = ins.insights.map((i) => `<li class="one"><div class="small"><b>${esc(i.question)}</b> <span class="muted">· ${esc(fmtDate(i.at))}</span></div><div class="answer small" style="margin-top:4px">${esc(i.answer)}</div></li>`).join("") || '<li class="one muted small">No questions asked yet</li>';
  }
  $("askGo").addEventListener("click", async () => {
    const q = $("askQ").value.trim(); if (!q) return;
    $("askGo").disabled = true; $("askStatus").textContent = "Thinking…"; $("askAnswer").hidden = true;
    try { const r = await api("POST", "/api/v1/insights/ask", { question: q }); $("askAnswer").hidden = false; $("askAnswer").textContent = r.answer; $("askStatus").textContent = r.model; const ins = await api("GET", "/api/v1/insights"); renderInsights(ins); }
    catch (e) { $("askStatus").textContent = ""; toast(e.message, 5000); }
    $("askGo").disabled = false;
  });

  // ---------- admin ----------
  async function loadAdmin() {
    if (!S.me || S.me.role !== "admin") return;
    try {
      const [u, k, s, a] = await Promise.all([api("GET", "/api/v1/admin/users"), api("GET", "/api/v1/admin/api-keys"), api("GET", "/api/v1/admin/settings"), api("GET", "/api/v1/admin/audit?limit=100")]);
      renderUsers(u.users); renderKeys(k.keys); renderSettings(s.settings); renderAudit(a.audit);
    } catch (e) { if (!e.auth) toast(e.message); }
  }
  function renderUsers(users) {
    $("userRows").innerHTML = users.map((u) => `<tr><td>${esc(u.name)}${u.id === S.me.userId ? ' <span class="muted small">(you)</span>' : ""}</td><td><span class="pill role ${u.role}">${u.role}</span></td><td>${u.active ? "active" : '<span class="muted">off</span>'}${u.lockedUntil && Date.parse(u.lockedUntil) > Date.now() ? ' <span class="pill low">locked</span>' : ""}</td><td class="btn-row" style="justify-content:flex-end"><button type="button" class="btn" data-act="pin" data-id="${u.id}">New PIN</button>${u.id !== S.me.userId ? `<button type="button" class="btn ${u.active ? "danger" : ""}" data-act="toggle" data-id="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? "Deactivate" : "Reactivate"}</button>` : ""}</td></tr>`).join("");
  }
  $("userRows").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    try {
      if (b.dataset.act === "toggle") { await api("PATCH", `/api/v1/admin/users/${b.dataset.id}`, { active: b.dataset.active !== "1" }); }
      else { const newPin = askPin(); if (!newPin) return; await api("PATCH", `/api/v1/admin/users/${b.dataset.id}`, { pin: newPin }); toast("PIN changed"); }
      loadAdmin();
    } catch (err) { toast(err.message); }
  });
  function askPin() { const v = window.prompt("New PIN (4–8 digits)"); if (v == null) return null; const t = v.trim(); if (/^[0-9]{4,8}$/.test(t)) return t; toast("PIN must be 4 to 8 digits"); return null; }
  $("userForm").addEventListener("submit", async (e) => { e.preventDefault(); try { await api("POST", "/api/v1/admin/users", { name: $("uName").value.trim(), pin: $("uPin").value.trim(), role: $("uRole").value }); $("uName").value = ""; $("uPin").value = ""; toast("Added"); loadAdmin(); } catch (err) { toast(err.message); } });
  function renderSettings(s) {
    S.settings = s; $("shopName").textContent = s.shop;
    $("sShop").value = s.shop; $("sUrl").value = s.appUrl || "";
    $("sRuns").value = Object.entries(s.sizeRuns || {}).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n");
    $("llmProvider").value = s.llm.provider; $("llmModel").value = s.llm.model || ""; $("llmBase").value = s.llm.baseUrl || ""; $("llmMax").value = s.llm.maxTokens || 800; $("llmKey").value = "";
    $("llmKeyState").textContent = s.llm.hasKey ? "· a key is saved" : "· no key yet";
    fillCats();
  }
  $("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const runs = {}; $("sRuns").value.split(/\n/).forEach((line) => { const i = line.indexOf(":"); if (i < 0) return; const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).split(/[,\s]+/).map((x) => x.trim()).filter(Boolean); if (k && v.length) runs[k] = v; });
    try { const r = await api("PUT", "/api/v1/admin/settings", { shop: $("sShop").value.trim(), appUrl: $("sUrl").value.trim(), sizeRuns: runs }); renderSettings(r.settings); toast("Settings saved"); } catch (err) { toast(err.message); }
  });
  $("llmForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const llm = { provider: $("llmProvider").value, model: $("llmModel").value.trim(), baseUrl: $("llmBase").value.trim(), maxTokens: +$("llmMax").value || 800 };
    if ($("llmKey").value.trim()) llm.apiKey = $("llmKey").value.trim();
    try { const r = await api("PUT", "/api/v1/admin/settings", { llm }); renderSettings(r.settings); toast("AI settings saved"); } catch (err) { toast(err.message); }
  });
  $("llmClear").addEventListener("click", async () => { try { const r = await api("PUT", "/api/v1/admin/settings", { llm: { clearKey: true, provider: "none" } }); renderSettings(r.settings); toast("Key removed"); } catch (err) { toast(err.message); } });
  function renderKeys(keys) {
    $("keyRows").innerHTML = keys.map((k) => `<tr><td>${esc(k.name)}${k.revokedAt ? ' <span class="muted small">(revoked)</span>' : ""}</td><td class="mono small">idx_${esc(k.prefix)}_…</td><td>${k.scopes.join(" + ")}</td><td class="small muted">${k.lastUsedAt ? fmtDate(k.lastUsedAt) + " " + fmtTime(k.lastUsedAt) : "never"}</td><td style="text-align:right">${k.revokedAt ? "" : `<button type="button" class="btn danger" data-revoke="${k.id}">Revoke</button>`}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No keys yet</td></tr>';
  }
  $("keyRows").addEventListener("click", async (e) => { const b = e.target.closest("button[data-revoke]"); if (!b) return; try { await api("DELETE", `/api/v1/admin/api-keys/${b.dataset.revoke}`); toast("Revoked"); loadAdmin(); } catch (err) { toast(err.message); } });
  $("keyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { const r = await api("POST", "/api/v1/admin/api-keys", { name: $("kName").value.trim(), scopes: $("kScope").value === "write" ? ["read", "write"] : ["read"] }); $("keyShow").hidden = false; $("keyValue").textContent = r.key; $("kName").value = ""; loadAdmin(); } catch (err) { toast(err.message); }
  });
  $("keyCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("keyValue").textContent); toast("Copied"); } catch { const r = document.createRange(); r.selectNodeContents($("keyValue")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Select and copy the key"); } });
  $("csvFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    $("csvMsg").textContent = "Importing…";
    try { const xl = /\.xlsx$/i.test(f.name); const r = xl ? await api("POST", "/api/v1/admin/import/xlsx", await f.arrayBuffer(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") : await api("POST", "/api/v1/admin/import/csv", await f.text(), "text/csv"); $("csvMsg").textContent = `${r.rows} rows: ${r.added} new, ${r.merged} topped up.`; await refresh(); loadAdmin(); }
    catch (err) { $("csvMsg").textContent = err.message; }
  });
  function renderAudit(rows) {
    $("auditRows").innerHTML = rows.map((a) => `<tr><td class="small muted">${esc(fmtDate(a.at))} ${esc(fmtTime(a.at))}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td class="small muted wrap">${esc(a.target || "")} ${esc(a.detail ? String(a.detail).slice(0, 120) : "")}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Nothing yet</td></tr>';
  }

  // ---------- start ----------
  setOnline(navigator.onLine);
  showGate();
})();
