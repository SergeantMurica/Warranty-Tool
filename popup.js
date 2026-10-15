import { DEFAULT_THEME, THEMES } from "./lib/themes.js";

const THEME_KEY = "warranty-tool-theme";
const CACHE_KEY = "wtContacts";
const AUTH_KEY = "wtAuth";
const DRAFT_KEY = "wtDraft";
const STATUSES = ["texted", "replied", "agreed", "declined", "none", "paid", "wrong_number_error"];
const STATUS_LABEL = {
  texted: "Texted",
  replied: "Replied",
  agreed: "Agreed",
  declined: "Declined",
  none: "No answer",
  paid: "Paid",
  wrong_number_error: "Wrong number/error",
};

const $ = (id) => document.getElementById(id);
const els = {
  authView: $("authView"), mainView: $("mainView"),
  authForm: $("authForm"), authName: $("authName"), nameField: $("nameField"),
  authEmail: $("authEmail"), authPass: $("authPass"), authError: $("authError"),
  authToggle: $("authToggle"), authSubmit: $("authSubmit"), signOut: $("signOut"),
  form: $("form"), phone: $("phone"), order: $("order"), name: $("name"),
  hint: $("hint"), error: $("error"), clear: $("clear"),
  tabs: $("tabs"), search: $("search"), list: $("list"), empty: $("empty"),
  count: $("count"), export: $("export"),
};

let auth = null;
let entries = [];
let filter = "all";
let signUpMode = false;

// ---------- helpers ----------
const send = (type, payload) =>
  new Promise((resolve) => chrome.runtime.sendMessage({ type, payload }, (r) => resolve(r || { ok: false, error: "No response." })));
const orderKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const digits = (s) => {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
};
const prettyPhone = (s) => {
  const d = digits(s);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (s || "").trim();
};
const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayLabel(ts) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function showError(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

// ---------- auth view ----------
function setMode(signUp) {
  signUpMode = signUp;
  els.nameField.hidden = !signUp;
  els.authSubmit.textContent = signUp ? "Create account" : "Sign in";
  els.authToggle.textContent = signUp ? "I have an account" : "Create account";
  els.authPass.autocomplete = signUp ? "new-password" : "current-password";
  showError(els.authError, "");
}
els.authToggle.addEventListener("click", () => setMode(!signUpMode));
els.authForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPass.value;
  const name = els.authName.value.trim();
  if (!email || !password || (signUpMode && !name)) {
    showError(els.authError, signUpMode ? "Enter your name, email and password." : "Enter your email and password.");
    return;
  }
  els.authSubmit.disabled = true;
  const r = await send(signUpMode ? "signUp" : "signIn", { email, password, name });
  els.authSubmit.disabled = false;
  if (!r.ok) showError(els.authError, r.error);
});
els.signOut.addEventListener("click", () => send("signOut"));

// ---------- state ----------
async function load() {
  const d = await chrome.storage.local.get([AUTH_KEY, CACHE_KEY]);
  auth = d[AUTH_KEY] || null;
  entries = Object.values(d[CACHE_KEY]?.items || {});
  els.authView.hidden = !!auth;
  els.mainView.hidden = !auth;
  if (auth) {
    els.signOut.textContent = `${auth.name} (sign out)`;
    updateHint();
    render();
  }
}
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && (c[AUTH_KEY] || c[CACHE_KEY])) load();
});

// ---------- draft ----------
function saveDraft() {
  const draft = { phone: els.phone.value, order: els.order.value, name: els.name.value };
  const hasAny = draft.phone || draft.order || draft.name;
  els.clear.hidden = !hasAny;
  if (hasAny) chrome.storage.local.set({ [DRAFT_KEY]: draft });
  else chrome.storage.local.remove(DRAFT_KEY);
}

// ---------- duplicate check ----------
function findDuplicates() {
  const p = digits(els.phone.value);
  const k = orderKey(els.order.value);
  return {
    byPhone: p.length >= 7 ? entries.find((e) => digits(e.phone) === p && e.id !== k) : null,
    byOrder: k ? entries.find((e) => e.id === k) : null,
  };
}
function updateHint() {
  const { byPhone, byOrder } = findDuplicates();
  els.order.classList.toggle("flag", !!byOrder);
  els.phone.classList.toggle("flag", !!byPhone);
  const msgs = [];
  if (byOrder) msgs.push(`${byOrder.by} already contacted this order on ${fmtDate(byOrder.ts)}.`);
  if (byPhone) msgs.push(`${byPhone.by} contacted this number (${byPhone.order}) on ${fmtDate(byPhone.ts)}.`);
  els.hint.textContent = msgs.join(" ");
  els.hint.hidden = msgs.length === 0;
}

// ---------- render ----------
function renderTabs() {
  const mine = entries.filter((e) => e.uid === auth?.uid).length;
  const counts = { all: entries.length, mine };
  for (const s of STATUSES) counts[s] = entries.filter((e) => e.status === s).length;
  const defs = [["all", "All"], ["mine", "Mine"], ...STATUSES.map((s) => [s, STATUS_LABEL[s]])];
  els.tabs.replaceChildren();
  for (const [key, label] of defs) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(filter === key));
    b.append(label);
    const n = document.createElement("b");
    n.textContent = counts[key];
    b.append(n);
    b.addEventListener("click", () => { filter = key; render(); });
    els.tabs.append(b);
  }
}

function copyButton(text, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "copy";
  b.textContent = label;
  b.title = "Click to copy";
  b.addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    b.classList.add("done");
    b.textContent = "Copied";
    setTimeout(() => { b.classList.remove("done"); b.textContent = label; }, 900);
  });
  return b;
}

function render() {
  const q = els.search.value.trim().toLowerCase();
  const qd = digits(q);
  const shown = entries
    .filter((e) => filter === "all" || (filter === "mine" ? e.uid === auth?.uid : e.status === filter))
    .filter((e) =>
      !q ||
      (qd && digits(e.phone).includes(qd)) ||
      e.order.toLowerCase().includes(q) ||
      e.customer.toLowerCase().includes(q) ||
      e.by.toLowerCase().includes(q)
    )
    .sort((a, b) => b.ts - a.ts);

  els.count.textContent = `${entries.length} logged`;
  renderTabs();
  els.list.replaceChildren();
  els.empty.hidden = shown.length > 0;
  els.empty.textContent = entries.length ? "No matches." : "Nothing logged yet. Log the first order above.";

  let lastDay = null;
  for (const e of shown) {
    const day = dayLabel(e.ts);
    if (day !== lastDay) {
      const h = document.createElement("div");
      h.className = "day";
      h.textContent = day;
      els.list.append(h);
      lastDay = day;
    }

    const row = document.createElement("div");
    row.className = "item";

    const title = document.createElement("div");
    title.className = "phone";
    title.textContent = e.order;

    const meta = document.createElement("div");
    meta.className = "meta";
    const by = document.createElement("span");
    by.className = "by";
    by.textContent = e.by;
    meta.append(by);
    if (e.customer) { const s = document.createElement("span"); s.textContent = e.customer; meta.append(s); }
    if (e.phone) meta.append(copyButton(e.phone, prettyPhone(e.phone)));
    const t = document.createElement("span");
    t.textContent = fmtTime(e.ts);
    meta.append(t);

    const side = document.createElement("div");
    side.className = "side";

    const chip = document.createElement("select");
    chip.className = "chip";
    chip.dataset.status = e.status;
    chip.title = "Change status";
    chip.setAttribute("aria-label", `Status for ${e.order}`);
    for (const s of STATUSES) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = STATUS_LABEL[s];
      o.selected = s === e.status;
      chip.append(o);
    }
    chip.addEventListener("change", async () => {
      const r = await send("upsert", { ...e, status: chip.value });
      if (!r.ok) { showError(els.error, r.error); chip.value = e.status; }
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "×";
    del.title = "Remove";
    del.setAttribute("aria-label", `Remove ${e.order}`);
    del.addEventListener("click", async () => {
      if (!confirm(`Remove ${e.order} from the shared log?`)) return;
      const r = await send("remove", { id: e.id });
      if (!r.ok) showError(els.error, r.error);
    });

    side.append(chip, del);
    row.append(title, meta, side);
    els.list.append(row);
  }
}

// ---------- events ----------
for (const input of [els.phone, els.order, els.name]) {
  input.addEventListener("input", () => { showError(els.error, ""); updateHint(); saveDraft(); });
}
els.search.addEventListener("input", render);

els.clear.addEventListener("click", () => {
  els.form.reset();
  updateHint();
  saveDraft();
  els.order.focus();
});

els.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!orderKey(els.order.value)) {
    showError(els.error, "Enter the order number.");
    els.order.focus();
    return;
  }
  const { byOrder } = findDuplicates();
  if (byOrder && !confirm(`${byOrder.by} already contacted this order. Overwrite with your contact?`)) return;

  const r = await send("upsert", {
    order: els.order.value.trim(),
    phone: els.phone.value.trim() ? prettyPhone(els.phone.value) : "",
    customer: els.name.value.trim(),
    status: "texted",
  });
  if (!r.ok) { showError(els.error, r.error); return; }
  els.form.reset();
  saveDraft();
  updateHint();
  filter = "all";
  els.order.focus();
});

els.export.addEventListener("click", () => {
  if (!entries.length) return;
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Order", "Phone", "Customer", "Status", "Contacted by", "Date"]].concat(
    entries.map((e) => [e.order, e.phone, e.customer, STATUS_LABEL[e.status], e.by, new Date(e.ts).toISOString()])
  );
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "warranty-contacts.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- theme ----------
const themeSelects = document.querySelectorAll(".theme-select");
for (const s of themeSelects) s.replaceChildren(...THEMES.map((t) => new Option(t.name, t.id)));

function applyTheme(id) {
  const p = THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME);
  const light = p.id === "white";
  const root = document.documentElement;
  root.dataset.theme = p.id;
  const vars = {
    "--bg": p.bg, "--panel": p.panel, "--surface": p.panel, "--line": p.line, "--ink": p.text,
    "--muted": p.muted, "--accent": p.accent, "--accent-ink": p.onAccent,
    "--accent-soft": `color-mix(in srgb, ${p.accent} 18%, ${p.panel})`,
    "--ok": light ? "#17794D" : "#55D69A", "--warn": light ? "#9A5B00" : "#F2BD62",
    "--bad": light ? "#B3261E" : "#FF8A80", "--danger": light ? "#B3261E" : "#FF8A80",
    "--idle": p.muted,
  };
  for (const k of ["ok", "warn", "bad"]) vars[`--${k}-soft`] = `color-mix(in srgb, var(--${k}) 18%, ${p.panel})`;
  vars["--idle-soft"] = `color-mix(in srgb, ${p.muted} 18%, ${p.panel})`;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  for (const s of themeSelects) s.value = p.id;
  chrome.storage.local.set({ [THEME_KEY]: p.id });
}
for (const s of themeSelects) s.addEventListener("change", () => applyTheme(s.value));

// ---------- init ----------
(async () => {
  applyTheme((await chrome.storage.local.get(THEME_KEY))[THEME_KEY]);
  const draft = (await chrome.storage.local.get(DRAFT_KEY))[DRAFT_KEY] || {};
  els.phone.value = draft.phone || "";
  els.order.value = draft.order || "";
  els.name.value = draft.name || "";
  els.clear.hidden = !(draft.phone || draft.order || draft.name);
  await load();
  (auth ? els.order : els.authEmail).focus();
  if (auth) send("refresh");
})();
