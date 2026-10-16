import { DEFAULT_THEME, THEMES } from "./lib/themes.js";
import {
  STAGE_TITLE,
  fallbackVariant,
  randomVariant,
  stageFor,
  variantById,
  variantStats,
} from "./lib/scripts.js";

const THEME_KEY = "warranty-tool-theme";
const CACHE_KEY = "wtContacts";
const AUTH_KEY = "wtAuth";
const DRAFT_KEY = "wtDraft";
const STATUSES = [
  "texted",
  "agreed",
  "declined",
  "paid",
  "none",
  "wrong_number_error",
  "already_has",
];
const STATUS_LABEL = {
  texted: "Texted",
  agreed: "Agreed",
  declined: "Declined",
  none: "No answer",
  paid: "Paid",
  wrong_number_error: "Wrong number/error",
  already_has: "Already Has",
};

const TAB_LABEL = { none: "No answer", wrong_number_error: "Wrong #" };

const $ = (id) => document.getElementById(id);
const els = {
  authView: $("authView"),
  mainView: $("mainView"),
  authForm: $("authForm"),
  authName: $("authName"),
  nameField: $("nameField"),
  authEmail: $("authEmail"),
  authPass: $("authPass"),
  authError: $("authError"),
  authToggle: $("authToggle"),
  authSubmit: $("authSubmit"),
  signOut: $("signOut"),
  scrub: $("scrub"),
  import: $("import"),
  importFile: $("importFile"),
  form: $("form"),
  phone: $("phone"),
  order: $("order"),
  name: $("name"),
  systemPrice: $("systemPrice"),
  watercooled: $("watercooled"),
  hint: $("hint"),
  error: $("error"),
  clear: $("clear"),
  tabs: $("tabs"),
  search: $("search"),
  list: $("list"),
  empty: $("empty"),
  count: $("count"),
  export: $("export"),
  total: $("total"),
  copyScript: $("copyScript"),
  scriptHint: $("scriptHint"),
  statsToggle: $("statsToggle"),
  stats: $("stats"),
};

// ---------- text script ----------
const PRICES = {
  2: [
    [2500, 180],
    [4500, 240],
    [12000, 320],
  ],
  3: [
    [2500, 240],
    [4500, 320],
    [12000, 480],
  ],
};
const WATERCOOLED_PRICES = { 2: 499, 3: 799 };
const MAX_PRICED_TOTAL = 12000;
const MANAGER_NOTE = "{manager to calculate}";
const priceFor = (years, total) =>
  total > MAX_PRICED_TOTAL
    ? null
    : PRICES[years].find(([max]) => total <= max)[1];
const priceText = (years, total) => {
  const p = priceFor(years, total);
  return p === null ? MANAGER_NOTE : `$${p}`;
};

function scriptContext(customer, systemPrice, watercooled = false) {
  const total = parseFloat(String(systemPrice).replace(/[^0-9.]/g, ""));
  const known = Number.isFinite(total);
  const tier = (years) =>
    watercooled
      ? `$${WATERCOOLED_PRICES[years]}`
      : known
        ? priceText(years, total)
        : `{${years} year}`;
  const first = String(customer || "")
    .trim()
    .split(/\s+/)[0];
  return {
    first: first || "there",
    rep: capitalizeName(auth?.name) || "{Employee Name}",
    two: tier(2),
    three: tier(3),
    build: known ? `a $${Math.round(total).toLocaleString()} build` : "your build",
  };
}

// Copies the script for the order's current stage: pitch, declined / no-answer follow-up, or invoice reply.
async function copyScript(e, button, stage = stageFor(e.status), save = true) {
  const variant =
    variantById(e.variant) ||
    (e.status === "texted" ? randomVariant() : fallbackVariant(e.id));
  const ctx = scriptContext(e.customer, e.systemPrice, e.watercooled === "yes");
  await navigator.clipboard.writeText(variant[stage](ctx));
  const label = button.textContent;
  button.textContent = "✓";
  setTimeout(() => {
    button.textContent = label;
  }, 900);
  // Only orders still awaiting a reply get a newly assigned variant, so stats aren't skewed.
  const assign = !e.variant && e.status === "texted";
  const followUp =
    (stage === "overcome" && !e.overcome) || (stage === "nudge" && !e.nudged);
  if (save && (assign || followUp)) {
    const r = await send("markScript", {
      id: e.id,
      variant: assign ? variant.id : "",
      overcome: stage === "overcome",
      nudged: stage === "nudge",
    });
    if (!r.ok) showError(els.error, r.error);
  }
}

let auth = null;
let entries = []; // every record, including hidden ones (used for duplicate checks)
const listed = () => entries.filter((e) => !e.hidden);
let filter = "all";
let signUpMode = false;
let editing = false;

// ---------- helpers ----------
const send = (type, payload) =>
  new Promise((resolve) =>
    chrome.runtime.sendMessage({ type, payload }, (r) =>
      resolve(r || { ok: false, error: "No response." }),
    ),
  );
const orderKey = (s) =>
  String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const digits = (s) => {
  let d = (s || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
};
const prettyPhone = (s) => {
  const d = digits(s);
  return d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : (s || "").trim();
};
const capitalizeName = (name) =>
  String(name || "").replace(/(^|[\s'-])(\p{L})/gu, (_, separator, letter) =>
    separator + letter.toLocaleUpperCase(),
  );
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
function dayLabel(ts) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
  const name = capitalizeName(els.authName.value.trim());
  els.authName.value = name;
  if (!email || !password || (signUpMode && !name)) {
    showError(
      els.authError,
      signUpMode
        ? "Enter your name, email and password."
        : "Enter your email and password.",
    );
    return;
  }
  els.authSubmit.disabled = true;
  const r = await send(signUpMode ? "signUp" : "signIn", {
    email,
    password,
    name,
  });
  els.authSubmit.disabled = false;
  if (!r.ok) showError(els.authError, r.error);
});
els.signOut.addEventListener("click", () => send("signOut"));
els.scrub.addEventListener("click", async () => {
  if (
    !confirm(
      "Permanently delete all customer names, phone numbers and prices from Firestore? Export a CSV first and make sure teammates have their own copies; this cannot be undone.",
    )
  )
    return;
  els.scrub.disabled = true;
  const r = await send("scrub");
  els.scrub.disabled = false;
  alert(r.ok ? "Firestore scrubbed." : `Scrub failed: ${r.error}`);
});
els.authName.addEventListener("blur", () => {
  els.authName.value = capitalizeName(els.authName.value);
});

// ---------- state ----------
async function load() {
  const d = await chrome.storage.local.get([AUTH_KEY, CACHE_KEY]);
  auth = d[AUTH_KEY] || null;
  if (auth?.name) {
    const name = capitalizeName(auth.name);
    if (auth.name !== name) {
      auth = { ...auth, name };
      await chrome.storage.local.set({ [AUTH_KEY]: auth });
    }
  }
  entries = Object.values(d[CACHE_KEY]?.items || {});
  els.authView.hidden = !!auth;
  els.mainView.hidden = !auth;
  if (auth) {
    els.scrub.hidden = auth.email?.toLowerCase() !== "alexander@metapcs.com";
    els.signOut.textContent = `${auth.name} (sign out)`;
    updateHint();
    if (!editing) render();
  }
}
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && (c[AUTH_KEY] || c[CACHE_KEY])) load();
});

// ---------- draft ----------
function saveDraft() {
  const draft = {
    phone: els.phone.value,
    order: els.order.value,
    name: els.name.value,
    systemPrice: els.systemPrice.value,
    watercooled: els.watercooled.checked,
  };
  const hasAny =
    draft.phone ||
    draft.order ||
    draft.name ||
    draft.systemPrice ||
    draft.watercooled;
  els.clear.hidden = !hasAny;
  if (hasAny) chrome.storage.local.set({ [DRAFT_KEY]: draft });
  else chrome.storage.local.remove(DRAFT_KEY);
}

// ---------- duplicate check ----------
function findDuplicates() {
  const p = digits(els.phone.value);
  const k = orderKey(els.order.value);
  return {
    byPhone:
      p.length >= 7
        ? entries.find((e) => digits(e.phone) === p && e.id !== k)
        : null,
    byOrder: k ? entries.find((e) => e.id === k) : null,
  };
}
function updateHint() {
  const { byPhone, byOrder } = findDuplicates();
  els.order.classList.toggle("flag", !!byOrder);
  els.phone.classList.toggle("flag", !!byPhone);
  const msgs = [];
  if (byOrder)
    msgs.push(
      `${capitalizeName(byOrder.by)} already contacted this order on ${fmtDate(byOrder.ts)}.`,
    );
  if (byPhone)
    msgs.push(
      `${capitalizeName(byPhone.by)} contacted this number (${byPhone.order}) on ${fmtDate(byPhone.ts)}.`,
    );
  els.hint.textContent = msgs.join(" ");
  els.hint.hidden = msgs.length === 0;
}

// ---------- render ----------
function renderTabs() {
  const visible = listed();
  const mine = visible.filter((e) => e.uid === auth?.uid).length;
  const counts = { all: visible.length, mine };
  for (const s of STATUSES)
    counts[s] = visible.filter((e) => e.status === s).length;
  const tab = (key, label, full = label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.dataset.status = key;
    b.title = full;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(filter === key));
    b.setAttribute("aria-label", `${full} (${counts[key]})`);
    const name = document.createElement("span");
    name.className = "tab-name";
    name.textContent = label;
    const n = document.createElement("b");
    n.textContent = counts[key];
    b.append(name, n);
    b.addEventListener("click", () => {
      filter = key;
      render();
    });
    return b;
  };
  const main = document.createElement("div");
  main.className = "tabs-main";
  main.append(tab("all", "All"), tab("mine", "Me"));
  const grid = document.createElement("div");
  grid.className = "tabs-status";
  for (const s of STATUSES)
    grid.append(tab(s, TAB_LABEL[s] || STATUS_LABEL[s], STATUS_LABEL[s]));
  els.tabs.replaceChildren(main, grid);
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
    setTimeout(() => {
      b.classList.remove("done");
      b.textContent = label;
    }, 900);
  });
  return b;
}

function closeEdit() {
  render();
}

function render() {
  editing = false;
  const q = els.search.value.trim().toLowerCase();
  const qd = digits(q);
  const visible = listed();
  const shown = visible
    .filter(
      (e) =>
        filter === "all" ||
        (filter === "mine" ? e.uid === auth?.uid : e.status === filter),
    )
    .filter(
      (e) =>
        !q ||
        (qd && digits(e.phone).includes(qd)) ||
        e.order.toLowerCase().includes(q) ||
        e.customer.toLowerCase().includes(q) ||
        e.by.toLowerCase().includes(q),
    )
    .sort((a, b) => b.ts - a.ts);

  els.count.textContent = `${visible.length} logged`;
  renderTabs();
  if (!els.stats.hidden) renderStats();
  els.list.replaceChildren();
  els.empty.hidden = shown.length > 0;
  els.empty.textContent = visible.length
    ? "No matches."
    : "Nothing logged yet. Log the first order above.";

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
    by.textContent = capitalizeName(e.by);
    meta.append(by);
    if (e.customer) {
      const s = document.createElement("span");
      s.textContent = e.customer;
      meta.append(s);
    }
    if (e.systemPrice) {
      const price = document.createElement("span");
      price.textContent = `$${Number(e.systemPrice).toLocaleString()}`;
      meta.append(price);
    }
    if (e.watercooled === "yes") {
      const wc = document.createElement("span");
      wc.className = "tag";
      wc.textContent = "Watercooled";
      meta.append(wc);
    }
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
      const stage = stageFor(chip.value);
      // Copy the follow-up while the change event still counts as a user gesture.
      if (stage !== "pitch")
        copyScript({ ...e, status: chip.value }, script, stage, false).catch(
          () => {},
        );
      const r = await send("upsert", {
        ...e,
        overcome: e.overcome || stage === "overcome",
        nudged: e.nudged || stage === "nudge",
        status: chip.value,
        expect: e.updateTime || "",
      });
      if (!r.ok) {
        showError(els.error, r.error);
        chip.value = e.status;
      }
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "×";
    del.title = "Remove";
    del.setAttribute("aria-label", `Remove ${e.order}`);
    del.addEventListener("click", async () => {
      if (
        !confirm(
          `Remove ${e.order} from the list? It stays on record so the order still shows as contacted on Shopify.`,
        )
      )
        return;
      const r = await send("remove", { id: e.id });
      if (!r.ok) showError(els.error, r.error);
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "del";
    edit.textContent = "✎";
    edit.title = "Edit customer, phone and system price";
    edit.setAttribute("aria-label", `Edit details for ${e.order}`);
    edit.addEventListener("click", () => {
      const form = document.createElement("div");
      form.className = "edit-row";
      const nameIn = document.createElement("input");
      nameIn.type = "text";
      nameIn.placeholder = "Customer name";
      nameIn.value = e.customer;
      nameIn.addEventListener("blur", () => {
        nameIn.value = capitalizeName(nameIn.value);
      });
      const phoneIn = document.createElement("input");
      phoneIn.type = "tel";
      phoneIn.placeholder = "Phone";
      phoneIn.value = e.phone;
      const priceIn = document.createElement("input");
      priceIn.type = "number";
      priceIn.min = "0";
      priceIn.step = "0.01";
      priceIn.inputMode = "decimal";
      priceIn.placeholder = "System price";
      priceIn.value = e.systemPrice || "";
      const wcLabel = document.createElement("label");
      wcLabel.className = "toggle";
      wcLabel.title = "Watercooled pricing: 2-yr $499 · 3-yr $799";
      const wcIn = document.createElement("input");
      wcIn.type = "checkbox";
      wcIn.checked = e.watercooled === "yes";
      wcLabel.append(wcIn, "Watercooled");
      const save = document.createElement("button");
      save.type = "button";
      save.className = "primary";
      save.textContent = "Save";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ghost";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", closeEdit);
      const submit = async () => {
        save.disabled = true;
        const r = await send("updateDetails", {
          id: e.id,
          customer: capitalizeName(nameIn.value.trim()),
          phone: phoneIn.value.trim() ? prettyPhone(phoneIn.value) : "",
          systemPrice: priceIn.value,
          watercooled: wcIn.checked ? "yes" : "",
        });
        if (!r.ok) {
          save.disabled = false;
          showError(els.error, r.error);
          return;
        }
        closeEdit();
      };
      save.addEventListener("click", submit);
      for (const i of [nameIn, phoneIn, priceIn]) {
        i.addEventListener("keydown", (k) => {
          if (k.key === "Enter") submit();
          else if (k.key === "Escape") closeEdit();
        });
      }
      form.append(nameIn, phoneIn, priceIn, wcLabel, save, cancel);
      row.append(form);
      edit.disabled = true;
      editing = true;
      (e.customer ? phoneIn : nameIn).focus();
    });

    const script = document.createElement("button");
    script.type = "button";
    script.className = "del";
    script.textContent = "✉";
    const stage = stageFor(e.status);
    const v = variantById(e.variant);
    script.title = `${STAGE_TITLE[stage]}${v ? ` · tone: ${v.name}` : ""}`;
    script.dataset.stage = stage;
    script.setAttribute("aria-label", `${STAGE_TITLE[stage]} for ${e.order}`);
    script.addEventListener("click", () => copyScript(e, script));

    side.append(chip, script, edit, del);
    row.append(title, meta, side);
    els.list.append(row);
  }
}

// ---------- A/B stats ----------
const pct = (x) => (x === null ? "–" : `${Math.round(x * 100)}%`);
function renderStats() {
  const rows = variantStats(entries);
  const best = Math.max(...rows.filter((r) => r.won + r.lost >= 5).map((r) => r.rate));
  const table = document.createElement("table");
  table.className = "stats-table";
  const head = table.createTHead().insertRow();
  for (const [h, t] of [
    ["Tone", ""],
    ["Sent", "Orders texted with this script"],
    ["Won", "Agreed + Paid"],
    ["Lost", "Declined + No answer"],
    ["Win", "Won / (Won + Lost)"],
    ["Saves", "Won after the declined follow-up / declined follow-ups sent"],
    ["Revived", "Won after the no-answer follow-up / no-answer follow-ups sent"],
  ]) {
    const th = document.createElement("th");
    th.textContent = h;
    th.title = t;
    head.append(th);
  }
  const body = table.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    if (r.rate !== null && r.rate === best) tr.className = "best";
    for (const v of [
      `${r.n}. ${r.name}`,
      r.sent,
      r.won,
      r.lost,
      pct(r.rate),
      r.followUps ? `${r.saves}/${r.followUps}` : "–",
      r.nudges ? `${r.revived}/${r.nudges}` : "–",
    ])
      tr.insertCell().textContent = v;
  }
  const t = rows.reduce(
    (a, r) => ({ won: a.won + r.won, lost: a.lost + r.lost }),
    { won: 0, lost: 0 },
  );
  const note = document.createElement("p");
  note.className = "stats-note";
  note.textContent = `Team total: ${t.won} won · ${t.lost} lost · ${pct(t.won + t.lost ? t.won / (t.won + t.lost) : null)} win rate. Best tone is highlighted once it has 5+ results.`;
  els.stats.replaceChildren(table, note);
}
els.statsToggle.addEventListener("click", () => {
  els.stats.hidden = !els.stats.hidden;
  els.statsToggle.textContent = els.stats.hidden ? "A/B stats" : "Hide stats";
  if (!els.stats.hidden) renderStats();
});

// ---------- events ----------
for (const input of [
  els.phone,
  els.order,
  els.name,
  els.systemPrice,
  els.watercooled,
]) {
  input.addEventListener("input", () => {
    showError(els.error, "");
    updateHint();
    saveDraft();
  });
}
els.name.addEventListener("blur", () => {
  els.name.value = capitalizeName(els.name.value);
  saveDraft();
});
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
  if (
    byOrder &&
    !confirm(
      byOrder.hidden
        ? `${capitalizeName(byOrder.by)} contacted this order before but removed it. Take it over as yours?`
        : `${capitalizeName(byOrder.by)} already contacted this order. Mark it Texted? It stays under ${capitalizeName(byOrder.by)}'s name.`,
    )
  )
    return;

  const r = await send("upsert", {
    order: els.order.value.trim(),
    phone: els.phone.value.trim() ? prettyPhone(els.phone.value) : "",
    customer: capitalizeName(els.name.value.trim()),
    systemPrice: els.systemPrice.value.trim(),
    watercooled: els.watercooled.checked ? "yes" : "",
    status: "texted",
    expect: byOrder ? byOrder.updateTime || "" : null,
  });
  if (!r.ok) {
    showError(els.error, r.error);
    return;
  }
  els.form.reset();
  saveDraft();
  updateHint();
  filter = "all";
  els.order.focus();
});

els.export.addEventListener("click", () => {
  const exported = listed();
  if (!exported.length) return;
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    [
      "Order",
      "Phone",
      "Customer",
      "System price",
      "Watercooled",
      "Status",
      "Script tone",
      "Declined follow-up sent",
      "No-answer follow-up sent",
      "Contacted by",
      "Date",
    ],
  ].concat(
    exported.map((e) => [
      e.order,
      e.phone,
      e.customer,
      e.systemPrice,
      e.watercooled === "yes" ? "Yes" : "",
      STATUS_LABEL[e.status],
      variantById(e.variant)?.name || "",
      e.overcome ? "Yes" : "",
      e.nudged ? "Yes" : "",
      capitalizeName(e.by),
      new Date(e.ts).toISOString(),
    ]),
  );
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], {
    type: "text/csv",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "warranty-contacts.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- import ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

els.import.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files[0];
  els.importFile.value = "";
  if (!file) return;
  const [head = [], ...body] = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
  const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name);
  const idx = { order: col("order"), phone: col("phone"), customer: col("customer"), systemPrice: col("system price"), watercooled: col("watercooled") };
  if (idx.order < 0) return alert("CSV needs an Order column.");
  const rows = body.map((r) => ({
    order: r[idx.order],
    phone: idx.phone < 0 ? "" : r[idx.phone],
    customer: idx.customer < 0 ? "" : r[idx.customer],
    systemPrice: idx.systemPrice < 0 ? "" : r[idx.systemPrice],
    watercooled:
      idx.watercooled >= 0 && /^(y|yes|true|1)$/i.test(String(r[idx.watercooled] || "").trim())
        ? "yes"
        : "",
  }));
  const r = await send("importPrivate", { rows });
  alert(r.ok ? `Imported ${r.count} rows to this device.` : `Import failed: ${r.error}`);
});

// ---------- theme ----------
const themeSelects = document.querySelectorAll(".theme-select");
for (const s of themeSelects)
  s.replaceChildren(...THEMES.map((t) => new Option(t.name, t.id)));

function applyTheme(id) {
  const p =
    THEMES.find((t) => t.id === id) ||
    THEMES.find((t) => t.id === DEFAULT_THEME);
  const light = p.id === "white";
  const root = document.documentElement;
  root.dataset.theme = p.id;
  const vars = {
    "--bg": p.bg,
    "--panel": p.panel,
    "--surface": p.panel,
    "--line": p.line,
    "--ink": p.text,
    "--muted": p.muted,
    "--accent": p.accent,
    "--accent-ink": p.onAccent,
    "--accent-soft": `color-mix(in srgb, ${p.accent} 18%, ${p.panel})`,
    "--ok": light ? "#17794D" : "#55D69A",
    "--warn": light ? "#9A5B00" : "#F2BD62",
    "--bad": light ? "#B3261E" : "#FF8A80",
    "--danger": light ? "#B3261E" : "#FF8A80",
    "--idle": p.muted,
  };
  for (const k of ["ok", "warn", "bad"])
    vars[`--${k}-soft`] = `color-mix(in srgb, var(--${k}) 18%, ${p.panel})`;
  vars["--idle-soft"] = `color-mix(in srgb, ${p.muted} 18%, ${p.panel})`;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  for (const s of themeSelects) s.value = p.id;
  chrome.storage.local.set({ [THEME_KEY]: p.id });
}
for (const s of themeSelects)
  s.addEventListener("change", () => applyTheme(s.value));

// ---------- init ----------
(async () => {
  applyTheme((await chrome.storage.local.get(THEME_KEY))[THEME_KEY]);
  const draft = (await chrome.storage.local.get(DRAFT_KEY))[DRAFT_KEY] || {};
  els.phone.value = draft.phone || "";
  els.order.value = draft.order || "";
  els.name.value = capitalizeName(draft.name || "");
  els.systemPrice.value = draft.systemPrice || "";
  els.watercooled.checked = !!draft.watercooled;
  els.clear.hidden = !(
    draft.phone ||
    draft.order ||
    draft.name ||
    draft.systemPrice ||
    draft.watercooled
  );
  await load();
  (auth ? els.order : els.authEmail).focus();
  if (auth) send("refresh");
})();
