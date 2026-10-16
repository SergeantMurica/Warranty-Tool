(() => {
  if (globalThis.__warrantyTrackerInstalled) return;
  globalThis.__warrantyTrackerInstalled = true;

  const CACHE_KEY = "wtContacts";
  const AUTH_KEY = "wtAuth";
  const LABEL = {
    texted: "Texted",
    agreed: "Agreed",
    declined: "Declined",
    none: "No answer",
    paid: "Paid",
    wrong_number_error: "Wrong number/error",
    already_has: "Already Has",
  };
  const ORDER_TEXT = /^#?[A-Za-z]{0,6}\d{3,}$/;

  let items = {};
  let signedIn = false;
  let myUid = "";
  let menu = null;
  const enrichSent = new Set();

  const orderKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // After the extension is reloaded, orphaned content scripts lose chrome.* access and throw.
  const alive = () => !!chrome.runtime?.id;
  const send = (type, payload) =>
    new Promise((resolve) => {
      if (!alive()) return resolve({ ok: false });
      try {
        chrome.runtime.sendMessage({ type, payload }, (r) => resolve(r || { ok: false }));
      } catch {
        resolve({ ok: false });
      }
    });

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
      if (signedIn && el.tagName === "H1") enrichFromPage(order);
    }
  }

  const tidyName = (s) =>
    String(s || "").trim().replace(/\s+/g, " ").replace(/(^|[\s'-])(\p{L})/gu, (_, sep, l) => sep + l.toLocaleUpperCase());

  // Orders list: read the Customer column of the row the badge sits in.
  function rowCustomer(el) {
    const row = el.closest("tr");
    const heads = row?.closest("table")?.querySelectorAll("thead th");
    if (!heads) return "";
    const i = [...heads].findIndex((h) => h.textContent.trim().toLowerCase() === "customer");
    const name = i < 0 ? "" : row.cells[i]?.textContent.trim() || "";
    return /no customer/i.test(name) ? "" : tidyName(name);
  }

  const root = () => document.querySelector("main") || document.body;
  const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;

  // Smallest element whose text starts with a label (e.g. "Subtotal") and also contains an amount.
  function amountAfter(label) {
    const ownText = (n) =>
      [...n.childNodes].filter((t) => t.nodeType === Node.TEXT_NODE).map((t) => t.data).join("").trim();
    const leaves = [...root().querySelectorAll("*")].filter((n) => ownText(n) === label);
    for (const leaf of leaves) {
      let n = leaf;
      for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
        const m = n.textContent.replace(/\s+/g, " ").match(new RegExp(`^\\s*${label}.*?\\$\\s?([\\d,]+(?:\\.\\d{2})?)`));
        if (m) return m[1].replace(/,/g, "");
      }
    }
    return "";
  }

  // Order detail page: best-effort read of customer name, phone and subtotal.
  function scrapeOrderPage() {
    const link = [...root().querySelectorAll('a[href*="/customers/"]')].find((a) =>
      /\p{L}/u.test(a.textContent) && !/view|customer$/i.test(a.textContent.trim()),
    );
    const customer = tidyName(link?.textContent);
    let phone = (root().querySelector('a[href^="tel:"]')?.getAttribute("href") || "").replace(/^tel:/, "");
    if (!phone && link) {
      // Walk up from the customer link to the card holding "Contact information" / addresses.
      let card = link;
      for (let i = 0; i < 10 && card && !PHONE.test(card.innerText || ""); i++) card = card.parentElement;
      phone = card?.innerText.match(PHONE)?.[0] || "";
    }
    return { customer, phone: phone.trim(), systemPrice: amountAfter("Subtotal") || amountAfter("Total") };
  }

  function enrichFromPage(order) {
    const id = orderKey(order);
    const c = items[id];
    if (!c || c.uid !== myUid || (c.customer && c.phone && c.systemPrice)) return;
    const data = scrapeOrderPage();
    const missing = ["customer", "phone", "systemPrice"].filter((f) => !c[f] && data[f]);
    if (!missing.length) return;
    const sig = `${id}|${missing.map((f) => data[f]).join("|")}`;
    if (enrichSent.has(sig)) return;
    enrichSent.add(sig);
    send("enrich", { order, ...data });
  }

  function closeMenu() {
    menu?.remove();
    menu = null;
  }

  async function act(order, status, el, seen) {
    closeMenu();
    const payload = { order, status, expect: seen ? seen.updateTime || "" : null };
    const fromList = el.tagName === "A";
    if (status === "texted" && fromList) {
      const customer = rowCustomer(el);
      if (customer) payload.customer = customer;
    }
    const r = await send("upsert", payload);
    if (!r.ok) return alert(r.error || "Could not save.");
    if (status === "texted" && fromList) send("openOrder", { url: el.href });
  }

  function onBadgeClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!signedIn) {
      alert("Open the Warranty Upsell Tracker popup and sign in first.");
      return;
    }
    closeMenu();
    const badge = ev.currentTarget;
    const order = badge.dataset.order;
    const target = badge.previousElementSibling;
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
      if (!c || c.status !== s) add(c ? `Mark ${LABEL[s]}` : `Log as ${LABEL[s]}`, () => act(order, s, target, c));
    }
    document.body.append(menu);
    const r = badge.getBoundingClientRect();
    menu.style.top = `${Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
    menu.style.left = `${Math.min(r.left, innerWidth - menu.offsetWidth - 8)}px`;
  }

  document.addEventListener("click", (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);

  let timer = 0;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(paint, 150); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

  async function load() {
    if (!alive()) return;
    const d = await chrome.storage.local.get([CACHE_KEY, AUTH_KEY]).catch(() => null);
    if (!d) return;
    items = d[CACHE_KEY]?.items || {};
    signedIn = !!d[AUTH_KEY];
    myUid = d[AUTH_KEY]?.uid || "";
    paint();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes[CACHE_KEY] || changes[AUTH_KEY])) load();
  });

  load();
  send("refresh");
})();
