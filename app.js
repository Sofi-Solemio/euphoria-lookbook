// Лукбук фабрик: вход, расшифровка страницы, черновик и отправка выбора.
// Один файл на весь сайт: 07_site.py кладёт его в site/app.js и подставляет адрес сервера.
// Виды страниц (PAGE.kind): factory — каталог фабрики, mine — «Мои модели», team — «Выбор команды», index — главная.
(() => {
"use strict";
const API = "https://script.google.com/macros/s/AKfycbwwfqZsOzyr_f_QFIzJwWjoat_KK0BZp2prh3rxO9prQ7D8cRVK7HGTQ1qk8HpsDb6a/exec";
const KEYS = {token: "lb:token", key: "lb:key", name: "lb:name", login: "lb:login"};
const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} },
};

const S = {models: [], byId: {}, mine: {}, team: {}, order: [], me: "", filter: "all", type: "", q: "", pending: {}, timer: null};

// ---------- сервер ----------

async function call(action, body) {
  const res = await fetch(API, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"},
                                body: JSON.stringify(Object.assign({action, token: store.get(KEYS.token)}, body || {}))});
  const j = await res.json();
  if (j.error === "auth") { logout("Вход устарел — войдите ещё раз."); throw new Error("auth"); }
  if (j.error) throw new Error(j.message || j.error);
  return j;
}

// ---------- расшифровка ----------

const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decrypt(enc) {
  const key = await crypto.subtle.importKey("raw", unb64(store.get(KEYS.key)), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({name: "AES-GCM", iv: unb64(enc.iv)}, key, unb64(enc.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---------- вход ----------

function css() {
  const s = el("style");
  s.textContent = `
.gate{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg)}
.gate form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:10px;background:var(--panel);border:1px solid var(--line);
  border-radius:16px;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.12)}
.gate h2{margin:0 0 4px;font-size:20px}.gate p{margin:0 0 6px;color:var(--muted);font-size:14px}
.gate input{width:100%;padding:12px 14px;font:inherit;font-size:16px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)}
.gate button{padding:12px;font:600 16px/1 inherit;border:0;border-radius:10px;background:var(--accent);color:#fff;cursor:pointer}
.gate button:disabled{opacity:.6}.gate .err{color:#C2452F;font-size:14px;min-height:18px}
.userbar{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:13px;color:var(--muted);margin-top:8px}
.userbar a{color:var(--accent);font-weight:600;text-decoration:none}.userbar a.on{text-decoration:underline}
.userbar button{border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:99px;padding:3px 10px;font:inherit;font-size:12px;cursor:pointer}
.userbar .me{margin-left:auto}`;
  document.head.appendChild(s);
}

function gate(message) {
  let g = $("gate");
  if (!g) {
    g = el("div", "gate"); g.id = "gate";
    g.innerHTML = '<form id="gform" autocomplete="on"><h2>Лукбук фабрик</h2><p>Войдите, чтобы открыть каталог.</p>' +
      '<input id="glogin" name="username" autocomplete="username" placeholder="логин" autocapitalize="none" required>' +
      '<input id="gpass" name="password" type="password" autocomplete="current-password" placeholder="пароль" required>' +
      '<div class="err" id="gerr"></div><button id="gbtn">Войти</button></form>';
    document.body.appendChild(g);
    $("gform").onsubmit = async e => {
      e.preventDefault();
      $("gbtn").disabled = true; $("gbtn").textContent = "Вхожу…";
      $("gerr").textContent = "Проверяю пароль — первый вход может занять до 10 секунд.";
      try {
        // пароль копируют из файла — пробелы и табуляция по краям не нужны
        const j = await call("login", {login: $("glogin").value.trim(), password: $("gpass").value.trim()});
        store.set(KEYS.token, j.token); store.set(KEYS.key, j.key); store.set(KEYS.name, j.name); store.set(KEYS.login, j.login);
        g.hidden = true;
        await start();
      } catch (err) {
        const m = String(err.message);
        $("gerr").textContent = m === "wrong" ? "Неверный логин или пароль." :
          m === "blocked" ? "Слишком много попыток — подождите 10 минут." : `Нет связи с сервером, попробуйте ещё раз (${m}).`;
      } finally { $("gbtn").disabled = false; $("gbtn").textContent = "Войти"; }
    };
  }
  g.hidden = false;
  $("gerr").textContent = message || "";
  if (!API.startsWith("http")) $("gerr").textContent = "Сервер выбора ещё не подключён.";
}

function logout(message) {
  Object.values(KEYS).forEach(store.del);
  const app = $("app"); if (app) app.hidden = true;
  gate(message);
}

function userbar() {
  if ($("userbar")) return;
  const bar = el("div", "userbar"); bar.id = "userbar";
  [["index.html", "Все фабрики"], ["moi-modeli.html", "Мои модели"], ["vybor-komandy.html", "Выбор команды"]].forEach(([href, text]) => {
    const a = el("a", location.pathname.endsWith("/" + href) ? "on" : "", text); a.href = href; bar.appendChild(a);
  });
  bar.appendChild(el("span", "me", store.get(KEYS.name) || ""));
  const out = el("button", "", "Выйти"); out.onclick = () => logout(); bar.appendChild(out);
  const header = document.querySelector("header.top");
  if (header) header.appendChild(bar); else $("app").prepend(bar);
}

// ---------- состояние выбора ----------

const marked = v => !!v && (v.like || v.stars > 0);
const sentMarked = v => !!v && (v.sent_like || v.sent_stars > 0);
const dirty = v => !!v && (!!v.like !== !!v.sent_like || (v.stars || 0) !== (v.sent_stars || 0));

function applyState(j) {
  S.me = j.login;
  S.mine = {};
  j.mine.forEach(r => { S.mine[r.id] = r; });
  S.team = {};
  j.team.forEach(r => { (S.team[r.id] = S.team[r.id] || []).push(r); });
  sortModels();
}

// отправленное — наверх: сначала по звёздам, потом лайк; остальные — в порядке каталога.
// Пересортировка только после загрузки и отправки, чтобы карточки не прыгали под пальцем.
function sortModels() {
  const pos = new Map(S.models.map((m, i) => [m.id, i]));
  const sentRank = m => { const v = S.mine[m.id]; return sentMarked(v) ? 10 + (v.sent_stars || 0) * 2 + (v.sent_like ? 1 : 0) : 0; };
  const teamRank = m => { const t = S.team[m.id] || []; return t.length * 100 + t.reduce((a, r) => a + r.stars, 0); };
  let list = S.models.slice();
  if (PAGE.kind === "mine") list = list.filter(m => marked(S.mine[m.id]) || sentMarked(S.mine[m.id]));
  if (PAGE.kind === "team") list = list.filter(m => (S.team[m.id] || []).length);
  const rank = PAGE.kind === "team" ? teamRank : sentRank;
  list.sort((a, b) => rank(b) - rank(a) || pos.get(a.id) - pos.get(b.id));
  S.order = list;
}

function mark(m, patch) {
  const cur = S.mine[m.id] || {id: m.id, like: false, stars: 0, sent_like: false, sent_stars: 0};
  const next = Object.assign({}, cur, patch);
  S.mine[m.id] = next;
  S.pending[m.id] = {id: m.id, like: !!next.like, stars: next.stars || 0, factory: m.factory, type: m.type, item_no: m.item_no || ""};
  clearTimeout(S.timer);
  S.timer = setTimeout(flush, 700);
  render();
}

async function flush() {
  clearTimeout(S.timer);
  const changes = Object.values(S.pending);
  if (!changes.length) return true;
  S.pending = {};
  try {
    await call("draft", {changes});
    status("");
    return true;
  } catch (err) {
    changes.forEach(c => { if (!S.pending[c.id]) S.pending[c.id] = c; });
    status("Черновик не сохранился — нет связи. Попробую ещё раз.");
    S.timer = setTimeout(flush, 5000);
    return false;
  }
}

async function send() {
  const btn = $("send");
  btn.disabled = true; btn.textContent = "Отправляю…";
  try {
    if (!(await flush())) throw new Error("draft");
    const j = await call("send");
    applyState(j);
    const s = j.sent || {};
    const parts = [s.picked && `выбрано ${s.picked}`, s.cancelled && `отменено ${s.cancelled}`, s.changed && `изменено ${s.changed}`].filter(Boolean);
    status(parts.length ? `Отправлено: ${parts.join(", ")}. Выбор виден команде, Софья получит сводку вечером.` : "Нечего отправлять.");
  } catch (err) {
    status("Не удалось отправить — проверьте интернет и нажмите ещё раз.");
  }
  render();
}

function status(text) {
  const s = $("status"); if (!s) return;
  s.textContent = text || ""; s.hidden = !text;
}

// ---------- карточки ----------

const rrcText = m => m.rrc_text || Number(m.rrc).toLocaleString("ru-RU") + " ₽";
const markText = r => [r.like ? "♥" : "", r.stars ? r.stars + "/5" : ""].filter(Boolean).join(" ");

function card(m) {
  const v = S.mine[m.id] || {};
  const cls = ["card"];
  if (m.rrc) cls.push("priced");
  if (sentMarked(v) && !dirty(v)) cls.push("sent");
  if (dirty(v)) cls.push("draft");
  if (v.like) cls.push("liked");
  const c = el("div", cls.join(" "));
  const ph = el("div", "ph"); ph.tabIndex = 0;
  const img = el("img"); img.loading = "lazy"; img.alt = m.type + " " + (m.item_no || "");
  img.src = m.web; img.style.width = (m.frames * 100) + "%";
  const dots = el("div", "dots");
  for (let i = 0; i < m.frames; i++) { const b = el("b"); if (i === 0) b.className = "on"; dots.appendChild(b); }
  ph.addEventListener("click", () => openBig(m));
  ph.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBig(m); } });
  ph.append(img, dots);
  if (dirty(v)) ph.appendChild(el("span", "flag draftflag", marked(v) ? "черновик" : "будет отменено"));
  else if (sentMarked(v)) ph.appendChild(el("span", "flag sentflag", "✓ отправлено"));
  const meta = el("div", "meta");
  if (PAGE.kind !== "factory") meta.appendChild(el("div", "fac", m.factory));
  meta.appendChild(el("div", "type", m.type));
  if (m.item_no) meta.appendChild(el("div", "art", m.item_no));
  if (m.fabric) meta.appendChild(el("div", "fab", m.fabric));
  if (m.price) meta.appendChild(el("div", "price", m.price + (m.price_note ? " · " + m.price_note : (m.rrc ? " · цена фабрики" : ""))));
  if (m.rrc) meta.appendChild(el("div", "rrc", "РРЦ " + rrcText(m)));
  const team = (S.team[m.id] || []).filter(r => PAGE.kind === "team" || r.login !== S.me);
  if (team.length) {
    const names = team.map(r => (r.login === S.me ? "вы" : r.name) + " " + markText(r));
    meta.appendChild(el("div", "team", (PAGE.kind === "team" ? "" : "Команда: ") + names.join(" · ")));
  }
  const acts = el("div", "acts");
  const heart = el("button", "heart" + (v.like ? " on" : ""), "♥");
  heart.title = "Нравится"; heart.setAttribute("aria-pressed", v.like ? "true" : "false");
  heart.onclick = () => mark(m, {like: !(S.mine[m.id] || {}).like});
  acts.appendChild(heart);
  const stars = el("div", "stars");
  for (let i = 1; i <= 5; i++) {
    const s = el("button", "star" + ((v.stars || 0) >= i ? " on" : ""), "★");
    s.title = i + " из 5";
    s.onclick = () => mark(m, {stars: (S.mine[m.id] || {}).stars === i ? 0 : i});
    stars.appendChild(s);
  }
  acts.appendChild(stars);
  if (marked(v)) {
    const x = el("button", "unpick", "✕"); x.title = "Убрать из выбора";
    x.onclick = () => mark(m, {like: false, stars: 0});
    acts.appendChild(x);
  }
  c.append(ph, meta, acts);
  return c;
}

function visible(m) {
  const v = S.mine[m.id] || {};
  if (S.filter === "new" && marked(v)) return false;
  if (S.filter === "like" && !v.like) return false;
  if (S.filter === "mine" && !marked(v) && !sentMarked(v)) return false;
  if (S.type && m.type !== S.type) return false;
  const q = S.q.trim().toLowerCase();
  if (q && !((m.item_no || "") + " " + (m.fabric || "") + " " + (m.description || "") + " " + m.factory).toLowerCase().includes(q)) return false;
  return true;
}

function render() {
  const grid = $("grid");
  grid.textContent = "";
  let shown = 0;
  const list = S.order.filter(visible);
  if (PAGE.kind === "mine") {
    const groups = [["Не отправлено — нажмите «Отправить»", list.filter(m => dirty(S.mine[m.id]))],
                    ["Отправлено", list.filter(m => !dirty(S.mine[m.id]))]];
    groups.forEach(([title, items]) => {
      if (!items.length) return;
      grid.appendChild(el("h2", "group", `${title} · ${items.length}`));
      items.forEach(m => { grid.appendChild(card(m)); shown++; });
    });
  } else {
    list.forEach(m => { grid.appendChild(card(m)); shown++; });
  }
  $("empty").hidden = shown > 0;
  $("empty").textContent = PAGE.kind === "mine" && !S.order.length ? "Вы пока ничего не выбрали — отмечайте модели сердцем и звёздами на страницах фабрик." :
    PAGE.kind === "team" && !S.order.length ? "Пока никто ничего не отправил." : "Ничего не найдено — снимите фильтры.";
  const all = PAGE.kind === "factory" ? S.models : S.order;
  const rated = all.filter(m => marked(S.mine[m.id])).length;
  if ($("bar")) $("bar").style.width = (all.length ? 100 * rated / all.length : 0).toFixed(1) + "%";
  $("cnt").textContent = PAGE.kind === "team" ? `${S.order.length} моделей выбрано командой` : `ваш выбор: ${rated} из ${all.length}`;
  const n = Object.values(S.mine).filter(dirty).length;
  const btn = $("send");
  btn.disabled = n === 0;
  btn.textContent = n ? `Отправить · ${n}` : "Всё отправлено";
}

// ---------- просмотр фото ----------

let view = {m: null, frame: 0};
function showFrame() {
  const {m, frame} = view;
  const img = $("bigimg");
  img.style.width = (m.frames * 100) + "%";
  img.style.transform = `translateX(${-frame * (100 / m.frames)}%)`;
  const dots = $("bigdots"); dots.textContent = "";
  for (let i = 0; i < m.frames; i++) { const b = el("b"); if (i === frame) b.className = "on"; dots.appendChild(b); }
  dots.hidden = m.frames < 2;
  $("dlgnum").textContent = m.frames > 1 ? `фото ${frame + 1} из ${m.frames}` : "";
  ["prev", "next"].forEach(id => { $(id).hidden = m.frames < 2; });
}
function step(d) { view.frame = (view.frame + d + view.m.frames) % view.m.frames; showFrame(); }
function openBig(m) {
  view = {m, frame: 0};
  $("bigimg").src = m.web;
  $("dlgcap").textContent = [m.factory, m.type, m.item_no, m.fabric, m.price, m.rrc ? "РРЦ " + rrcText(m) : ""].filter(Boolean).join(" · ");
  showFrame();
  $("dlg").showModal();
}
function viewer() {
  $("dlgclose").onclick = () => $("dlg").close();
  $("dlg").addEventListener("click", e => { if (e.target.id === "dlg") $("dlg").close(); });
  $("prev").onclick = e => { e.stopPropagation(); step(-1); };
  $("next").onclick = e => { e.stopPropagation(); step(1); };
  $("bigimg").onclick = () => { if (view.m && view.m.frames > 1) step(1); };
  document.addEventListener("keydown", e => {
    if (!$("dlg").open || !view.m) return;
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });
  let x0 = null;
  $("viewer").addEventListener("touchstart", e => { x0 = e.changedTouches[0].clientX; }, {passive: true});
  $("viewer").addEventListener("touchend", e => {
    if (x0 === null || !view.m) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  }, {passive: true});
}

function tools() {
  const chips = [["f-all", "all"], ["f-new", "new"], ["f-like", "like"], ["f-mine", "mine"]];
  chips.forEach(([id, f]) => {
    if (!$(id)) return;
    $(id).onclick = () => {
      S.filter = f;
      chips.forEach(([cid, cf]) => { if ($(cid)) $(cid).setAttribute("aria-pressed", String(cf === f)); });
      render();
    };
  });
  const sel = $("f-type");
  [...new Set(S.models.map(m => m.type))].sort().forEach(t => { const o = el("option", null, t); o.value = t; sel.appendChild(o); });
  sel.onchange = e => { S.type = e.target.value; render(); };
  $("f-q").oninput = e => { S.q = e.target.value; render(); };
  $("send").onclick = send;
  window.addEventListener("beforeunload", e => {
    if (Object.keys(S.pending).length) { flush(); e.preventDefault(); e.returnValue = ""; }
  });
}

// ---------- запуск ----------

let started = false;
async function start() {
  if (!store.get(KEYS.token) || !store.get(KEYS.key)) { gate(); return; }
  try {
    if (PAGE.kind === "index") {
      $("hub").innerHTML = await decrypt(ENC);
    } else if (typeof ENC !== "undefined") {
      S.models = await decrypt(ENC);
    } else if (PAGE.kind === "mine" || PAGE.kind === "team") {
      const res = await fetch("catalog.enc.json", {cache: "no-cache"});
      S.models = await decrypt(await res.json());
    } else {
      S.models = MODELS;     // локальный просмотр незашифрованной страницы
    }
  } catch (err) {
    logout("Ключ сайта сменился — войдите ещё раз.");
    return;
  }
  $("app").hidden = false;
  userbar();
  if (PAGE.kind === "index") {
    call("state").then(j => {
      const mine = j.mine.filter(r => r.sent_like || r.sent_stars > 0).length;
      const team = new Set(j.team.map(r => r.id)).size;
      if ($("cnt-mine")) $("cnt-mine").textContent = `${mine} отправлено`;
      if ($("cnt-team")) $("cnt-team").textContent = `${team} моделей`;
    }).catch(() => {});
    return;
  }
  S.byId = Object.fromEntries(S.models.map(m => [m.id, m]));
  if (!started) { tools(); viewer(); started = true; }
  S.order = S.models.slice();
  render();
  status("Загружаю выбор…");
  try {
    applyState(await call("state"));
    status("");
  } catch (err) {
    if (String(err.message) !== "auth") status("Нет связи с сервером выбора — отметки пока не сохраняются.");
  }
  render();
}

css();
start();
})();
