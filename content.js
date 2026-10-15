(() => {
  if (globalThis.__warrantyTrackerInstalled) return;
  globalThis.__warrantyTrackerInstalled = true;

  const CACHE_KEY = "wtContacts";
  const AUTH_KEY = "wtAuth";
  const LABEL = {
    texted: "Texted",
    replied: "Replied",
    agreed: "Agreed",
    declined: "Declined",
    none: "No answer",
    paid: "Paid",
    wrong_number_error: "Wrong number/error",
  };
  const ORDER_TEXT = /^#?[A-Za-z]{0,6}\d{3,}$/;

  let items = {};
  let signedIn = false;
  let menu = null;

  const orderKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const send = (type, payload) =>
    new Promise((resolve) => chrome.runtime.sendMessage({ type, payload }, (r) => resolve(r || { ok: false })));

  function orderTargets() {
    const found = [];
    for (const a of document.querySelectorAll('a[href*="/orders/"]')) {
      if (!/\/orders\/\d+/.test(a.getAttribute("href") || "")) continue;
      const text = a.textContent.trim();
      if (ORDER_TEXT.test(text)) found.push({ el: a, order: text });
    }
    if (/\/orders\/\d+/.test(location.pathname)) {
      const h1 = [...document.querySelectorAll("h1")].find((h) => ORDER_TEXT.test(h.textContent.trim()));
      if (h1) found.push({ el: h1, order: h1.textContent.trim() });
    }
    return found;
  }

  function badgeFor(el) {
    const next = el.nextElementSibling;
    return next && next.classList.contains("wt-badge") ? next : null;
  }

  function paint() {
    for (const { el, order } of orderTargets()) {
      const id = orderKey(order);
      const c = items[id];
      let b = badgeFor(el);
      if (!b) {
        b = document.createElement("span");
        b.className = "wt-badge";
        b.addEventListener("click", onBadgeClick);
        el.insertAdjacentElement("afterend", b);
      }
      const state = c ? c.status : "new";
      const text = !signedIn ? "Warranty: sign in" : c ? `${LABEL[c.status] || c.status}: ${c.by}` : "Not contacted";
      if (b.dataset.state !== state) b.dataset.state = state;
      if (b.dataset.order !== order) b.dataset.order = order;
      if (b.textContent !== text) b.textContent = text;
      b.title = c ? `${c.by} · ${new Date(c.ts).toLocaleString()}${c.note ? "\n" + c.note : ""}` : "Click to log";
    }
  }

  function closeMenu() {
    menu?.remove();
    menu = null;
  }

  async function act(order, status) {
    closeMenu();
    const r = await send("upsert", { order, status });
    if (!r.ok) alert(r.error || "Could not save.");
  }

  function onBadgeClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!signedIn) {
      alert("Open the Warranty Upsell Tracker popup and sign in first.");
      return;
    }
    closeMenu();
    const order = ev.currentTarget.dataset.order;
    const c = items[orderKey(order)];
    menu = document.createElement("div");
    menu.className = "wt-menu";
    const title = document.createElement("div");
    title.className = "wt-menu-title";
    title.textContent = c ? `${order} — ${c.by}` : order;
    menu.append(title);
    const add = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      menu.append(b);
    };
    for (const s of Object.keys(LABEL)) {
      if (!c || c.status !== s) add(c ? `Mark ${LABEL[s]}` : `Log as ${LABEL[s]}`, () => act(order, s));
    }
    document.body.append(menu);
    const r = ev.currentTarget.getBoundingClientRect();
    menu.style.top = `${Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
    menu.style.left = `${Math.min(r.left, innerWidth - menu.offsetWidth - 8)}px`;
  }

  document.addEventListener("click", (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);

  let timer = 0;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(paint, 150); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

  async function load() {
    const d = await chrome.storage.local.get([CACHE_KEY, AUTH_KEY]);
    items = d[CACHE_KEY]?.items || {};
    signedIn = !!d[AUTH_KEY];
    paint();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes[CACHE_KEY] || changes[AUTH_KEY])) load();
  });

  load();
  send("refresh");
})();
