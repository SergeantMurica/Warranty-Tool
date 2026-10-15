importScripts("config.js");

const CFG = self.WARRANTY_CONFIG;
const AUTH_KEY = "wtAuth";
const CACHE_KEY = "wtContacts";
const STATUSES = ["texted", "replied", "declined", "none"];

const DOCS = () =>
  `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents/${CFG.collection}`;

const orderKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

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
  if (code.startsWith("WEAK_PASSWORD")) return "Password must be at least 6 characters.";
  return key ? map[key] : code;
}

async function identity(endpoint, body) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${CFG.apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
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
  const j = await identity("signInWithPassword", { email, password, returnSecureToken: true });
  await setAuth(toAuth(j));
  await refreshContacts();
}

async function signUp({ email, password, name }) {
  let j = await identity("signUp", { email, password, returnSecureToken: true });
  j = await identity("update", { idToken: j.idToken, displayName: name, returnSecureToken: true })
    .then((u) => ({ ...j, ...u, localId: j.localId, email: j.email }));
  await setAuth(toAuth(j, name));
  await refreshContacts();
}

async function signOut() {
  await chrome.storage.local.remove([AUTH_KEY, CACHE_KEY]);
}

async function validToken() {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  if (a.expiresAt - 60000 > Date.now()) return a.idToken;
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: a.refreshToken }),
  });
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message || `Request failed (${res.status})`);
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
    note: s("note"),
    status: s("status") || "texted",
    by: s("by"),
    uid: s("uid"),
    ts: Number(f.ts?.integerValue || 0),
  };
}

function encode(c) {
  const str = (v) => ({ stringValue: String(v || "") });
  return {
    fields: {
      order: str(c.order), phone: str(c.phone), customer: str(c.customer), note: str(c.note),
      status: str(c.status), by: str(c.by), uid: str(c.uid),
      ts: { integerValue: String(c.ts) },
    },
  };
}

async function refreshContacts() {
  const out = {};
  let pageToken = "";
  do {
    const q = new URLSearchParams({ pageSize: "300" });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(`${DOCS()}?${q}`);
    for (const d of j.documents || []) {
      const c = decode(d);
      out[c.id] = c;
    }
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  await chrome.storage.local.set({ [CACHE_KEY]: { items: out, fetchedAt: Date.now() } });
}

async function patchCache(fn) {
  const cur = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || { items: {} };
  fn(cur.items);
  await chrome.storage.local.set({ [CACHE_KEY]: cur });
}

async function upsert(input) {
  const a = await getAuth();
  if (!a) throw new Error("Not signed in.");
  const id = orderKey(input.order);
  if (!id) throw new Error("Order number is required.");
  const status = STATUSES.includes(input.status) ? input.status : "texted";
  const contact = {
    id, order: String(input.order).trim(), phone: input.phone || "", customer: input.customer || "",
    note: input.note || "", status, by: a.name, uid: a.uid, ts: Date.now(),
  };
  await api(`${DOCS()}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(encode(contact)) });
  await patchCache((items) => { items[id] = contact; });
}

async function remove(id) {
  await api(`${DOCS()}/${encodeURIComponent(id)}`, { method: "DELETE" });
  await patchCache((items) => { delete items[id]; });
}

// ---------- messaging / polling ----------
const handlers = {
  signIn, signUp, signOut, upsert,
  remove: ({ id }) => remove(id),
  refresh: refreshContacts,
};

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  const fn = handlers[msg?.type];
  if (!fn) return false;
  Promise.resolve(fn(msg.payload || msg))
    .then(() => respond({ ok: true }))
    .catch((e) => respond({ ok: false, error: e.message }));
  return true;
});

function setupAlarm() {
  chrome.alarms.create("wt-poll", { periodInMinutes: Math.max(0.5, CFG.pollSeconds / 60) });
}
chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "wt-poll" && (await getAuth())) refreshContacts().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));
chrome.runtime.onStartup.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));
