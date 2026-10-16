importScripts("config.js");

const CFG = self.WARRANTY_CONFIG;
const AUTH_KEY = "wtAuth";
const CACHE_KEY = "wtContacts";
const PRIVATE_KEY = "wtPrivate"; // customer name / phone / price: stored only on this device
const PRIVATE_FIELDS = ["phone", "customer", "systemPrice", "watercooled"];
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
// A/B text-script variants (ids match lib/scripts.js).
const VARIANT_IDS = Array.from({ length: 10 }, (_, i) => `v${i + 1}`);
const randomVariant = () =>
  VARIANT_IDS[Math.floor(Math.random() * VARIANT_IDS.length)];
// Bumped when cached records change shape (v2: updateTime, v3: legacy "replied" folded into texted, v4: A/B variant).
const CACHE_VERSION = 4;
const CONFLICT_CODES = ["ALREADY_EXISTS", "FAILED_PRECONDITION"];

const DOCS = () =>
  `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents/${CFG.collection}`;

const orderKey = (s) =>
  String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// ---------- auth ----------
async function getAuth() {
  return (await chrome.storage.local.get(AUTH_KEY))[AUTH_KEY] || null;
}
const setAuth = (a) => chrome.storage.local.set({ [AUTH_KEY]: a });

function authError(json) {
  const code = json?.error?.message || "AUTH_FAILED";
  const map = {
    EMAIL_EXISTS: "That email already has an account. Sign in instead.",
    EMAIL_NOT_FOUND: "No account for that email.",
    INVALID_PASSWORD: "Wrong password.",
    INVALID_LOGIN_CREDENTIALS: "Wrong email or password.",
    OPERATION_NOT_ALLOWED: "Email/password sign-in is disabled in Firebase.",
  };
  const key = Object.keys(map).find((k) => code.startsWith(k));
  if (code.startsWith("WEAK_PASSWORD"))
    return "Password must be at least 6 characters.";
  return key ? map[key] : code;
}

async function identity(endpoint, body) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${CFG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(authError(json));
  return json;
}

function toAuth(j, fallbackName) {
  return {
    uid: j.localId,
    email: j.email,
    name: j.displayName || fallbackName || j.email.split("@")[0],
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    expiresAt: Date.now() + Number(j.expiresIn || 3600) * 1000,
  };
}

async function signIn({ email, password }) {
  const j = await identity("signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
  await setAuth(toAuth(j));
  await refreshContacts();
}

async function signUp({ email, password, name }) {
  let j = await identity("signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  j = await identity("update", {
    idToken: j.idToken,
    displayName: name,
    returnSecureToken: true,
  }).then((u) => ({ ...j, ...u, localId: j.localId, email: j.email }));
  await setAuth(toAuth(j, name));
  await refreshContacts();
}

async function signOut() {
  await chrome.storage.local.remove([AUTH_KEY, CACHE_KEY, SYNC_KEY]);
}

async function validToken() {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  if (a.expiresAt - 60000 > Date.now()) return a.idToken;
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: a.refreshToken,
      }),
    },
  );
  const j = await res.json();
  if (!res.ok) {
    await signOut();
    throw new Error("Session expired. Sign in again.");
  }
  await setAuth({
    ...a,
    idToken: j.id_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + Number(j.expires_in || 3600) * 1000,
  });
  return j.id_token;
}

async function api(url, options = {}) {
  const token = await validToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const err = new Error(
      j?.error?.message || `Request failed (${res.status})`,
    );
    err.code = j?.error?.status || "";
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ---------- firestore ----------
function decode(doc) {
  const f = doc.fields || {};
  const s = (k) => f[k]?.stringValue || "";
  return {
    id: doc.name.split("/").pop(),
    order: s("order"),
    phone: s("phone"),
    customer: s("customer"),
    systemPrice: s("systemPrice"),
    note: s("note"),
    status: STATUSES.includes(s("status")) ? s("status") : "texted",
    by: s("by"),
    uid: s("uid"),
    hidden: f.hidden?.booleanValue === true,
    variant: VARIANT_IDS.includes(s("variant")) ? s("variant") : "",
    overcome: f.overcome?.booleanValue === true,
    nudged: f.nudged?.booleanValue === true,
    ts: Number(f.ts?.integerValue || 0),
    updatedAt: Number(f.updatedAt?.integerValue || 0),
    updateTime: doc.updateTime || "",
  };
}

function encode(c) {
  const str = (v) => ({ stringValue: String(v || "") });
  return {
    fields: {
      order: str(c.order),
      note: str(c.note),
      status: str(c.status),
      by: str(c.by),
      uid: str(c.uid),
      hidden: { booleanValue: !!c.hidden },
      variant: str(c.variant),
      overcome: { booleanValue: !!c.overcome },
      nudged: { booleanValue: !!c.nudged },
      ts: { integerValue: String(c.ts) },
      updatedAt: { integerValue: String(c.updatedAt || Date.now()) },
    },
  };
}

const SHARED_FIELDS = [
  "order",
  "note",
  "status",
  "by",
  "uid",
  "hidden",
  "variant",
  "overcome",
  "nudged",
  "ts",
  "updatedAt",
];

// updateMask keeps legacy phone/customer/price in Firestore untouched until the admin scrubs them.
// expect: null = document must not exist yet; string = server updateTime we last saw.
// Firestore rejects the write if the precondition fails, so a stale view can't overwrite a teammate.
async function writeDoc(contact, { fields = SHARED_FIELDS, expect } = {}) {
  const q = new URLSearchParams();
  fields.forEach((f) => q.append("updateMask.fieldPaths", f));
  if (expect === null) q.set("currentDocument.exists", "false");
  else if (expect) q.set("currentDocument.updateTime", expect);
  const all = encode(contact).fields;
  const doc = await api(`${DOCS()}/${encodeURIComponent(contact.id)}?${q}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: Object.fromEntries(fields.map((f) => [f, all[f]])),
    }),
  });
  return doc?.updateTime || "";
}

async function fetchOne(id) {
  const [c] = await mergePrivate([
    decode(await api(`${DOCS()}/${encodeURIComponent(id)}`)),
  ]);
  await patchCache((items) => {
    items[id] = c;
  });
  return c;
}

async function conflictError(cur, a) {
  const label = STATUS_LABEL[cur.status] || cur.status;
  const msg =
    cur.uid === a.uid
      ? `${cur.order} changed since this page loaded (now ${label}). Try again.`
      : `${cur.order} was already taken by ${cur.by} (${label}). Your change was not saved.`;
  return new Error(msg);
}

async function getPrivate() {
  return (await chrome.storage.local.get(PRIVATE_KEY))[PRIVATE_KEY] || {};
}

// Only fields present in data are overwritten, so callers that don't know them keep the saved values.
async function savePrivate(id, data) {
  const priv = await getPrivate();
  const next = { ...priv[id] };
  for (const f of PRIVATE_FIELDS)
    if (data[f] !== undefined) next[f] = String(data[f] || "").trim();
  priv[id] = next;
  await chrome.storage.local.set({ [PRIVATE_KEY]: priv });
  return next;
}

// Fills blank customer details (scraped from the Shopify order page) without touching typed-in values.
async function enrich({ order, ...data }) {
  const id = orderKey(order);
  if (!id) return 0;
  const priv = await getPrivate();
  const cur = priv[id] || {};
  const add = {};
  for (const f of PRIVATE_FIELDS) {
    const v = String(data[f] || "").trim();
    if (v && !cur[f]) add[f] = v;
  }
  const n = Object.keys(add).length;
  if (!n) return 0;
  priv[id] = { ...cur, ...add };
  await chrome.storage.local.set({ [PRIVATE_KEY]: priv });
  await patchCache((items) => {
    if (items[id]) Object.assign(items[id], add);
  });
  return n;
}

function openOrder({ url }, sender) {
  if (
    !/^https:\/\/admin\.shopify\.com\/store\/[^/]+\/orders\/\d+/.test(url || "")
  )
    throw new Error("Bad order link.");
  const tab = sender?.tab;
  return chrome.tabs
    .create({
      url,
      active: false,
      ...(tab
        ? { index: tab.index + 1, openerTabId: tab.id, windowId: tab.windowId }
        : {}),
    })
    .then(() => 1);
}

// Overlays this device's local customer data onto records from Firestore.
async function mergePrivate(list) {
  const priv = await getPrivate();
  return list.map((c) => ({
    ...c,
    phone: "",
    customer: "",
    systemPrice: "",
    watercooled: "",
    ...priv[c.id],
  }));
}

// Merges phone/customer/price rows (e.g. from a CSV export) into local storage only.
async function importPrivate({ rows }) {
  const priv = await getPrivate();
  let count = 0;
  for (const r of rows || []) {
    const id = orderKey(r.order);
    if (!id) continue;
    const next = { ...priv[id] };
    for (const f of PRIVATE_FIELDS) {
      const v = String(r[f] || "").trim();
      if (v) next[f] = v;
    }
    priv[id] = next;
    count++;
  }
  await chrome.storage.local.set({ [PRIVATE_KEY]: priv });
  await patchCache((items) => {
    for (const id of Object.keys(items))
      if (priv[id]) Object.assign(items[id], priv[id]);
  });
  return count;
}

const SYNC_KEY = "wtSyncAt";
const SYNC_OVERLAP_MS = 2 * 60 * 1000; // tolerate clock skew between teammates
const MIN_REFRESH_MS = 60 * 1000;
let inflight = null;

async function fullFetch() {
  const all = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({ pageSize: "300" });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(`${DOCS()}?${q}`);
    for (const d of j.documents || []) all.push(decode(d));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return Object.fromEntries((await mergePrivate(all)).map((c) => [c.id, c]));
}

async function changedSince(since) {
  const parent = DOCS().replace(/\/[^/]+$/, "");
  const res = await api(`${parent}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: CFG.collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: "updatedAt" },
            op: "GREATER_THAN",
            value: { integerValue: String(since) },
          },
        },
      },
    }),
  });
  return mergePrivate(
    (res || []).filter((r) => r.document).map((r) => decode(r.document)),
  );
}

// Incremental: after the first full load, only documents changed since the last sync are read.
async function doRefresh(force) {
  const store = await chrome.storage.local.get([CACHE_KEY, SYNC_KEY]);
  const syncedAt = store[SYNC_KEY] || 0;
  const cached = store[CACHE_KEY];
  if (!force && cached && Date.now() - syncedAt < MIN_REFRESH_MS) return;
  const startedAt = Date.now();
  if (!cached || !syncedAt || cached.v !== CACHE_VERSION) {
    await chrome.storage.local.set({
      [CACHE_KEY]: {
        items: await fullFetch(),
        fetchedAt: startedAt,
        v: CACHE_VERSION,
      },
      [SYNC_KEY]: startedAt,
    });
    return;
  }
  const changed = await changedSince(syncedAt - SYNC_OVERLAP_MS);
  const dirty = changed.filter(
    (c) => JSON.stringify(cached.items[c.id]) !== JSON.stringify(c),
  );
  if (dirty.length) {
    for (const c of dirty) cached.items[c.id] = c;
    await chrome.storage.local.set({
      [CACHE_KEY]: {
        items: cached.items,
        fetchedAt: startedAt,
        v: CACHE_VERSION,
      },
    });
  }
  await chrome.storage.local.set({ [SYNC_KEY]: startedAt });
}

function refreshContacts(force = false) {
  inflight ||= doRefresh(force).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function patchCache(fn) {
  const cur = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {
    items: {},
  };
  fn(cur.items);
  await chrome.storage.local.set({ [CACHE_KEY]: cur });
}

async function upsert(input) {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  const id = orderKey(input.order);
  if (!id) throw new Error("Order number is required.");
  const status = STATUSES.includes(input.status) ? input.status : "texted";
  const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]
    ?.items?.[id];
  // Callers pass what the user was looking at; fall back to the cache when they don't.
  let expect =
    input.expect !== undefined
      ? input.expect
      : cached
        ? cached.updateTime
        : null;
  // The record the precondition guarantees we're replacing (null = brand new order).
  let prev = expect === null ? null : cached;
  if (expect !== null && (!expect || cached?.updateTime !== expect)) {
    // Cached before updateTime was tracked, or the cache moved on: compare against the live doc.
    const fresh = await fetchOne(id);
    const stale = expect
      ? fresh.updateTime !== expect
      : cached && (fresh.status !== cached.status || fresh.uid !== cached.uid);
    if (stale) throw await conflictError(fresh, a);
    prev = fresh;
    expect = fresh.updateTime;
  }
  const now = Date.now();
  // The original texter keeps the order when a teammate changes its status; only a hidden
  // (removed) record can be claimed by someone else.
  const owner =
    prev && !prev.hidden
      ? prev
      : { by: a.name, uid: a.uid, ts: now, note: "", variant: "", overcome: false, nudged: false };
  // New contacts get a random script variant; existing ones keep theirs so outcomes stay attributed.
  const variant = VARIANT_IDS.includes(owner.variant)
    ? owner.variant
    : VARIANT_IDS.includes(input.variant)
      ? input.variant
      : status === "texted"
        ? randomVariant()
        : "";
  const contact = {
    id,
    order: String(input.order).trim(),
    note: input.note ?? owner.note ?? "",
    status,
    variant,
    overcome: !!(input.overcome ?? owner.overcome),
    nudged: !!(input.nudged ?? owner.nudged),
    by: owner.by,
    uid: owner.uid,
    ts: owner.ts,
    updatedAt: now,
  };
  try {
    contact.updateTime = await writeDoc(contact, { expect });
  } catch (e) {
    if (!CONFLICT_CODES.includes(e.code)) throw e;
    throw await conflictError(await fetchOne(id), a);
  }
  const priv = await savePrivate(id, input);
  const full = {
    phone: "",
    customer: "",
    systemPrice: "",
    watercooled: "",
    ...priv,
    ...contact,
  };
  await patchCache((items) => {
    items[id] = full;
  });
}

// Customer details live only on this device, so editing them never writes to Firestore.
async function updateDetails({
  id,
  phone,
  customer,
  systemPrice,
  watercooled,
}) {
  const cur = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]?.items?.[
    id
  ];
  if (!cur) throw new Error("Order not found. Refresh and try again.");
  const priv = await savePrivate(id, {
    phone,
    customer,
    systemPrice,
    watercooled: watercooled || "",
  });
  await patchCache((items) => {
    items[id] = { ...items[id], ...priv };
  });
}

// Records which script variant was sent and whether the declined / no-answer follow-ups went out.
// Only these fields are written, so a teammate's newer status is never reverted.
async function markScript({ id, variant, overcome, nudged }) {
  const cur = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]?.items?.[
    id
  ];
  if (!cur) throw new Error("Order not found. Refresh and try again.");
  const fields = ["updatedAt"];
  const contact = { ...cur, updatedAt: Date.now() };
  if (VARIANT_IDS.includes(variant) && !cur.variant) {
    contact.variant = variant;
    fields.push("variant");
  }
  if (overcome && !cur.overcome) {
    contact.overcome = true;
    fields.push("overcome");
  }
  if (nudged && !cur.nudged) {
    contact.nudged = true;
    fields.push("nudged");
  }
  if (fields.length === 1) return;
  contact.updateTime = await writeDoc(contact, { fields });
  await patchCache((items) => {
    items[id] = contact;
  });
}

// Soft delete: the record stays so the order still shows as contacted on Shopify.
// Only hidden/updatedAt are written, so a teammate's newer status is never reverted.
async function remove(id) {
  const cur = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]?.items?.[
    id
  ];
  if (!cur) throw new Error("Order not found. Refresh and try again.");
  const contact = { ...cur, hidden: true, updatedAt: Date.now() };
  contact.updateTime = await writeDoc(contact, {
    fields: ["hidden", "updatedAt"],
  });
  await patchCache((items) => {
    items[id] = contact;
  });
}

// Admin only: deletes phone/customer/price from every Firestore document.
async function scrub() {
  const a = await getAuth();
  if (a?.email?.toLowerCase() !== CFG.adminEmail)
    throw new Error("Not allowed.");
  const parent = DOCS().replace(/\/[^/]+$/, "");
  const writes = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({ pageSize: "300" });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(`${DOCS()}?${q}`);
    for (const d of j.documents || []) {
      writes.push({
        update: { name: d.name, fields: {} },
        updateMask: { fieldPaths: PRIVATE_FIELDS },
      });
    }
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  for (let i = 0; i < writes.length; i += 400) {
    await api(`${parent.replace(/\/documents.*/, "/documents")}:commit`, {
      method: "POST",
      body: JSON.stringify({ writes: writes.slice(i, i + 400) }),
    });
  }
}

// ---------- messaging / polling ----------
const handlers = {
  signIn,
  signUp,
  signOut,
  upsert,
  updateDetails,
  markScript,
  scrub,
  importPrivate,
  enrich,
  openOrder,
  remove: ({ id }) => remove(id),
  refresh: (p) => refreshContacts(!!p?.force),
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const fn = handlers[msg?.type];
  if (!fn) return false;
  Promise.resolve()
    .then(() => fn(msg.payload || msg, sender))
    .then((count) => respond({ ok: true, count }))
    .catch((e) => respond({ ok: false, error: e.message }));
  return true;
});

function setupAlarm() {
  chrome.alarms.create("wt-poll", {
    periodInMinutes: Math.max(0.5, CFG.pollSeconds / 60),
  });
}
chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "wt-poll") return;
  // Skip background polls while the user is away; the next page load or panel open catches up.
  const state = chrome.idle ? await chrome.idle.queryState(300) : "active";
  if (state !== "active") return;
  if (await getAuth()) refreshContacts(true).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
);
chrome.runtime.onStartup.addListener(() =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
);
