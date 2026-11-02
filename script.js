/* ===== PROTEÇÃO BÁSICA (botão direito e atalhos) ===== */
/* Liberada automaticamente quando o admin está logado (window.__ADMIN_UNLOCK) */
(function () {
  document.addEventListener("contextmenu", function (e) { if (!window.__ADMIN_UNLOCK) e.preventDefault(); });
  document.addEventListener("dragstart", function (e) { if (!window.__ADMIN_UNLOCK && e.target.tagName === "IMG") e.preventDefault(); });
  document.addEventListener("keydown", function (e) {
    if (window.__ADMIN_UNLOCK) return;
    var k = (e.key || "").toLowerCase(), c = e.ctrlKey || e.metaKey;
    if (k === "f12" ||
        (c && e.shiftKey && ["i", "j", "c", "k"].indexOf(k) > -1) ||
        (c && ["u", "s", "p"].indexOf(k) > -1) ||
        (e.metaKey && e.altKey && ["i", "j", "c", "u"].indexOf(k) > -1)) {
      e.preventDefault(); e.stopPropagation(); return false;
    }
  }, true);
})();

/* ===== CONFIGURAÇÃO DO FIREBASE =====
   Substitua pelos dados do seu projeto (Console Firebase > Configurações do projeto > Seus apps > Web) */
const firebaseConfig = {
  apiKey: "AIzaSyA41WO8_8fUBCLt2ZOUcFYAcihqyeG11wU",
  authDomain: "patches-4096f.firebaseapp.com",
  databaseURL: "https://patches-4096f-default-rtdb.firebaseio.com",
  projectId: "patches-4096f",
  storageBucket: "patches-4096f.firebasestorage.app",
  messagingSenderId: "717458444908",
  appId: "1:717458444908:web:8b6d7ffb3831b6cb12be49"
};
/* O e-mail do admin NÃO fica no código: guardamos só o hash SHA-256 dele.
   Para trocar: gere o SHA-256 do novo e-mail (minúsculo) e cole abaixo. */
const ADMIN_EMAIL_HASH = "5edfa2692bdacc5e6ee805c626c50cb44cebb065f092d9a1067d89f74dacd326";
async function sha256(t) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const rootRef = firebase.database().ref();
const db = rootRef.child("patches");
const vault = rootRef.child("vault"); /* links de Patches com senha: vault/{id}/{chave da senha} */

const $ = (id) => document.getElementById(id);
let patches = {};
let isAdmin = false;

const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl = (u = "") => /^https?:\/\//i.test(u) ? esc(u) : "#";

$("year").textContent = new Date().getFullYear();

/* ===== AUTENTICAÇÃO ===== */
auth.onAuthStateChanged(async user => {
  isAdmin = !!user && !!user.email && (await sha256(user.email.toLowerCase())) === ADMIN_EMAIL_HASH;
  window.__ADMIN_UNLOCK = isAdmin;
  document.body.classList.toggle("is-admin", isAdmin);
  if (user && !isAdmin) auth.signOut();
  $("adminPanel").classList.toggle("hidden", !isAdmin);
  $("btnAdmin").classList.toggle("hidden", isAdmin);
  subscribe();
});

$("btnAdmin").onclick = () => $("loginModal").classList.remove("hidden");
$("btnCloseLogin").onclick = () => $("loginModal").classList.add("hidden");
$("btnLogout").onclick = () => auth.signOut();

function setLoading(on) {
  $("loginLoading").classList.toggle("hidden", !on);
  $("btnLogin").disabled = on;
  $("btnCloseLogin").disabled = on;
}

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("loginError").textContent = "";
  const email = $("lEmail").value.trim().toLowerCase();
  setLoading(true);
  try {
    if ((await sha256(email)) !== ADMIN_EMAIL_HASH) throw new Error("x");
    await auth.signInWithEmailAndPassword(email, $("lPass").value);
    $("loginModal").classList.add("hidden");
    $("loginForm").reset();
  } catch {
    $("loginError").textContent = "E-mail ou senha inválidos.";
  } finally {
    setLoading(false);
  }
};

/* ===== BANCO DE DADOS =====
   Visitantes só podem ler os Patches visíveis (consulta exigida pelas regras).
   O admin lê tudo. */
let liveQuery = null, migrated = false;
function subscribe() {
  if (liveQuery) liveQuery.off();
  patches = {}; render();
  liveQuery = isAdmin ? db : db.orderByChild("visible").equalTo(true);
  liveQuery.on("value", snap => {
    patches = snap.val() || {};
    render();
    if (isAdmin && !migrated) { migrated = true; migrateLegacy().catch(err => console.error(err)); }
  }, err => { $("status").textContent = "Erro ao carregar: " + err.message; $("status").classList.remove("hidden"); });
}

/* Converte automaticamente Patches do formato antigo (hash no banco) para o novo. */
async function migrateLegacy() {
  const updates = {};
  Object.entries(patches).forEach(([id, p]) => {
    if (typeof p.visible !== "boolean") updates["patches/" + id + "/visible"] = true;
    if (!p.zipProtection) return;
    const legacy = PatchTools.legacyKey(p.zipProtection);
    updates["patches/" + id + "/zipProtection"] = null;
    if (!legacy) return;
    updates["patches/" + id + "/locked"] = legacy.lock;
    updates["patches/" + id + "/links"] = null;
    updates["vault/" + id] = { [legacy.key]: { links: p.links || [] } };
  });
  if (Object.keys(updates).length) await rootRef.update(updates);
}

/* Admin: lê a chave e os links guardados no cofre de um Patch com senha. */
async function readVault(id) {
  const snap = await vault.child(id).once("value");
  const entries = Object.entries(snap.val() || {});
  return entries.length ? { key: entries[0][0], links: entries[0][1].links || [] } : null;
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  const list = Object.entries(patches)
    .filter(([, p]) => isAdmin || p.visible !== false)
    .filter(([, p]) => !q || p.title?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q))
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  $("status").textContent = list.length ? "" : (q ? "Nenhum resultado encontrado." : "Nenhum Patch publicado ainda.");
  $("status").classList.toggle("hidden", !!list.length);

  $("grid").innerHTML = list.map(([id, p]) => `
    <article class="card" data-id="${id}">
      <div class="dvd"><img src="${safeUrl(p.cover)}" alt="${esc(p.title)}" loading="lazy"></div>
      ${isAdmin ? `<span class="badge ${p.visible === false ? "badge-off" : ""}">${p.visible === false ? "Oculto · só ZIP" : "Visível"}</span>` : ""}
      <h3>${esc(p.title)}</h3>
      <div class="meta"><span class="code">${esc(p.code)}</span><span class="size">${esc(p.size)} ${esc(p.unit)}</span></div>
      ${isAdmin ? `<div class="admin-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${id}">Editar</button>
        <button class="btn btn-primary btn-sm" data-gen="${id}">ZIP</button>
        <button class="btn btn-danger btn-sm" data-del="${id}">Excluir</button></div>` : ""}
    </article>`).join("");
}
$("search").oninput = render;

$("grid").onclick = (e) => {
  const edit = e.target.dataset.edit, del = e.target.dataset.del;
  if (e.target.dataset.gen) return generatePage(e.target.dataset.gen);
  if (edit) return startEdit(edit);
  if (del) { if (confirm("Excluir este Patch?")) rootRef.update({ ["patches/" + del]: null, ["vault/" + del]: null }).catch(err => alert("Erro ao excluir: " + err.message)); return; }
  const card = e.target.closest(".card");
  if (card) openDetail(card.dataset.id);
};

/* ===== DETALHES ===== */
function linksHtml(links) {
  return `<h4>Downloads (${links.length})</h4>` + (links.length ? links.map(l => `
    <a class="dl" href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">
      <span>${esc(l.label || "Download")}</span><b>BAIXAR ↓</b>
    </a>`).join("") : `<p class="muted">Nenhum link disponível.</p>`);
}
function openDetail(id) {
  const p = patches[id]; if (!p) return;
  const locked = PatchTools.validLock(p.locked);
  $("detailContent").innerHTML = `
    <div class="detail">
      <div class="dvd"><img src="${safeUrl(p.cover)}" alt="${esc(p.title)}"></div>
      <div>
        <h2>${esc(p.title)}</h2>
        <div class="meta" style="justify-content:flex-start;gap:14px">
          <span class="code">${esc(p.code)}</span><span class="size">${esc(p.size)} ${esc(p.unit)}</span>
        </div>
        <p class="desc">${esc(p.desc)}</p>
        <div class="downloads" id="detailDownloads">${locked ? (isAdmin ? `<p class="muted">Carregando links...</p>` : `
          <h4>Patch protegido</h4>
          <form id="unlockForm">
            <label>Senha de acesso<input id="unlockPass" type="password" autocomplete="current-password" required></label>
            <button class="btn btn-primary" id="unlockBtn" type="submit" style="margin-top:10px">Liberar downloads</button>
            <p id="unlockError" class="muted" role="alert" style="margin-top:8px"></p>
          </form>`) : linksHtml(p.links || [])}</div>
      </div>
    </div>`;
  $("detailModal").classList.remove("hidden");
  if (!locked) return;
  if (isAdmin) {
    readVault(id).then(v => { $("detailDownloads").innerHTML = linksHtml(v ? v.links : []); })
      .catch(err => { $("detailDownloads").innerHTML = `<p class="muted">Erro: ${esc(err.message)}</p>`; });
    return;
  }
  $("unlockForm").onsubmit = async (e) => {
    e.preventDefault();
    $("unlockBtn").disabled = true;
    $("unlockError").textContent = "Verificando...";
    try {
      const key = await PatchTools.unlockKey($("unlockPass").value, p.locked);
      const snap = await vault.child(id + "/" + key).once("value");
      if (!snap.exists()) throw new Error("Senha incorreta. Tente novamente.");
      $("detailDownloads").innerHTML = linksHtml(snap.val().links || []);
    } catch (err) {
      $("unlockError").textContent = err.message;
      $("unlockPass").value = "";
      $("unlockBtn").disabled = false;
    }
  };
}
$("btnCloseDetail").onclick = () => $("detailModal").classList.add("hidden");
document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); }));

/* ===== FORMULÁRIO ADMIN ===== */
function addLinkRow(label = "", url = "") {
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = `
    <input class="l-label" placeholder="Versão / Servidor (ex: v1.2 - Mega)" value="${esc(label)}">
    <input class="l-url" type="url" placeholder="https://..." value="${esc(url)}" required>
    <button type="button" class="btn btn-danger btn-sm">Remover</button>`;
  row.querySelector("button").onclick = () => row.remove();
  $("linksList").appendChild(row);
}
$("btnAddLink").onclick = () => addLinkRow();

let editingLock = null;
function setZipColor(color) {
  color = PatchTools.normalizeColor(color);
  const channels = PatchTools.rgb(color);
  $("fColor").value = color;
  ["fRed", "fGreen", "fBlue"].forEach((id,i) => $(id).value = channels[i]);
  $("fHue").value = PatchTools.colorHue(color);
  $("colorValue").textContent = "RGB(" + channels.join(", ") + ") · " + color;
  $("colorGreen").setAttribute("aria-pressed", String(color === PatchTools.GREEN));
  $("colorCyan").setAttribute("aria-pressed", String(color === PatchTools.CYAN));
}
$("colorGreen").onclick = () => setZipColor(PatchTools.GREEN);
$("colorCyan").onclick = () => setZipColor(PatchTools.CYAN);
$("fColor").oninput = () => setZipColor($("fColor").value);
$("fHue").oninput = () => { const hue = $("fHue").value; setZipColor(PatchTools.hueColor(hue)); $("fHue").value = hue; };
["fRed","fGreen","fBlue"].forEach(id => $(id).oninput = () => {
  const channels = ["fRed","fGreen","fBlue"].map(key => $(key).value);
  if (channels.every(n => n !== "" && Number(n) >= 0 && Number(n) <= 255)) setZipColor(PatchTools.fromRgb(channels));
});
function syncPasswordFields() {
  const enabled = $("fProtected").checked;
  $("passwordFields").classList.toggle("hidden", !enabled);
  $("fPatchPassword").disabled = !enabled;
  $("fPatchPassword").required = enabled && !editingLock;
  $("passwordHint").textContent = editingLock ? "Deixe em branco para manter a senha atual; preencha para trocar." : "Informe a senha que será exigida para abrir o Patch.";
  if (!enabled) $("fPatchPassword").value = "";
}
$("fProtected").onchange = syncPasswordFields;
function resetForm() {
  $("patchForm").reset();
  $("patchId").value = "";
  $("linksList").innerHTML = "";
  addLinkRow();
  $("fVisible").checked = true;
  editingLock = null;
  setZipColor(PatchTools.GREEN);
  syncPasswordFields();
  $("formTitle").textContent = "Novo Patch";
}
$("btnCancel").onclick = resetForm;

async function startEdit(id) {
  const p = patches[id]; if (!p) return;
  let links = p.links || [];
  editingLock = PatchTools.validLock(p.locked) ? p.locked : null;
  if (editingLock) {
    try { const v = await readVault(id); links = v ? v.links : []; }
    catch (err) { alert("Erro ao carregar os links: " + err.message); return; }
  }
  $("patchId").value = id;
  $("fTitle").value = p.title || "";
  $("fCode").value = p.code || "";
  $("fCover").value = p.cover || "";
  $("fSize").value = p.size || "";
  $("fUnit").value = p.unit || "GB";
  $("fDesc").value = p.desc || "";
  $("fVisible").checked = p.visible !== false;
  setZipColor(p.zipColor);
  $("fProtected").checked = !!editingLock;
  $("fPatchPassword").value = "";
  syncPasswordFields();
  $("linksList").innerHTML = "";
  (links.length ? links : [{}]).forEach(l => addLinkRow(l.label, l.url));
  $("formTitle").textContent = "Editando: " + p.title;
  $("adminPanel").scrollIntoView({ behavior: "smooth" });
}

$("patchForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!isAdmin) return;
  const id = $("patchId").value;
  const code = $("fCode").value.trim();
  const dup = Object.entries(patches).find(([k, p]) => k !== id && p.code?.toLowerCase() === code.toLowerCase());
  if (dup) { alert("Já existe um Patch com este código."); return; }

  const links = [...document.querySelectorAll(".link-row")]
    .map(r => ({ label: r.querySelector(".l-label").value.trim(), url: r.querySelector(".l-url").value.trim() }))
    .filter(l => l.url);

  const saveButtons = [...$("patchForm").querySelectorAll('button[type="submit"]')];
  saveButtons.forEach(button => button.disabled = true);
  $("patchForm").setAttribute("aria-busy", "true");
  try {
  const savedId = id || db.push().key;
  let lock = null, key = null;
  if ($("fProtected").checked) {
    if ($("fPatchPassword").value) ({ lock, key } = await PatchTools.createLock($("fPatchPassword").value));
    else if (id && editingLock) { const v = await readVault(id); lock = editingLock; key = v && v.key; }
    if (!lock || !key) throw new Error("Informe uma nova senha para o Patch.");
  }
  const data = {
    title: $("fTitle").value.trim(),
    code,
    cover: $("fCover").value.trim(),
    size: parseFloat($("fSize").value),
    unit: $("fUnit").value,
    desc: $("fDesc").value.trim(),
    links: lock ? null : links,
    visible: $("fVisible").checked,
    zipColor: PatchTools.normalizeColor($("fColor").value),
    locked: lock,
    updatedAt: Date.now(),
    createdAt: (id && patches[id] && patches[id].createdAt) || Date.now()
  };
    /* Patch e cofre gravados juntos; senha e hash nunca vão para o banco. */
    await rootRef.update({
      ["patches/" + savedId]: data,
      ["vault/" + savedId]: lock ? { [key]: { links } } : null
    });
    const gen = e.submitter && e.submitter.id === "btnSaveGen";
    resetForm();
    if (gen) await generatePage(savedId, data); else alert("Patch salvo com sucesso!");
  } catch (err) { alert("Erro ao salvar: " + err.message); }
  finally { saveButtons.forEach(button => button.disabled = false); $("patchForm").removeAttribute("aria-busy"); }
};

resetForm();

const BASE_PAGE_CSS = ":root{--bg:#07090a;--surface:#0e1211;--surface-2:#141a18;--border:#1f2a26;--text:#e6efe9;--muted:#8a9a92;--green:#22e07a;--green-dim:#15a85a;--glow:rgba(34,224,122,.25)}\n*{box-sizing:border-box;margin:0;padding:0}\nbody{background:var(--bg);color:var(--text);font-family:'Rajdhani',sans-serif;font-size:17px;line-height:1.5;min-height:100vh;display:flex;flex-direction:column;background-image:radial-gradient(ellipse at top,rgba(34,224,122,.08),transparent 55%)}\nmain{flex:1}\na{color:inherit;text-decoration:none}\n.wrap{width:min(1000px,92%);margin:0 auto}\n.topbar{border-bottom:1px solid var(--border);height:64px;display:flex;align-items:center}\n.brand{font-weight:700;font-size:1.4rem;letter-spacing:2px}\n.brand b,.brand span{color:var(--green)}\n.patch{display:grid;grid-template-columns:300px 1fr;gap:40px;padding:48px 0 60px}\n.dvd{position:relative;aspect-ratio:135/190;border-radius:4px;overflow:hidden;background:#000;box-shadow:0 20px 40px -10px var(--glow),0 6px 18px rgba(0,0,0,.6);border:1px solid var(--border)}\n.dvd::before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:7%;background:linear-gradient(90deg,rgba(255,255,255,.15),rgba(0,0,0,.4));z-index:1}\n.dvd::after{content:\"DVD\";position:absolute;top:0;left:0;right:0;background:var(--green);color:#03140a;font-weight:700;font-size:12px;letter-spacing:4px;text-align:center;padding:3px 0;z-index:2}\n.dvd img{width:100%;height:100%;object-fit:cover;display:block}\n.eyebrow{font-family:'JetBrains Mono',monospace;color:var(--green);font-size:13px;margin-bottom:6px}\nh1{font-size:clamp(2rem,5vw,2.8rem);line-height:1.1}\n.meta{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:14px}\n.code{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--green);background:rgba(34,224,122,.08);border:1px solid rgba(34,224,122,.25);padding:3px 10px;border-radius:4px}\n.size{color:var(--muted);font-weight:600}\n.desc{color:var(--muted);white-space:pre-line;margin:20px 0 28px}\n.downloads h2{color:var(--green);letter-spacing:2px;text-transform:uppercase;font-size:15px;margin-bottom:12px}\n.dl{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;background:var(--surface-2);transition:all .2s}\n.dl:hover{border-color:var(--green);box-shadow:0 0 20px var(--glow);transform:translateX(4px)}\n.dl span{font-weight:600}\n.dl b{background:var(--green);color:#03140a;padding:5px 12px;border-radius:6px;font-size:13px;letter-spacing:1px;white-space:nowrap}\n.muted{color:var(--muted)}\n.footer{border-top:1px solid var(--border);padding:20px 0;color:var(--muted);font-size:14px;text-align:center}\n@media(max-width:700px){.patch{grid-template-columns:1fr;gap:24px;padding:28px 0 40px}.dvd{max-width:220px;margin:0 auto;width:100%}}\n.hidden{display:none!important}\n.status{text-align:center;color:var(--muted);padding:80px 0}\nbody{-webkit-user-select:none;user-select:none}\n";

const PAGE_CSS = BASE_PAGE_CSS
  .replaceAll("rgba(34,224,122,.08)", "var(--accent-soft)")
  .replaceAll("rgba(34,224,122,.25)", "var(--accent-border)")
  .replaceAll("#03140a", "var(--accent-ink)") + `
:root{--accent-soft:rgba(34,224,122,.08);--accent-border:rgba(34,224,122,.25);--accent-ink:#07090a;--error:#ff5468}
body{background-image:none}h1{font-size:2.8rem;overflow-wrap:anywhere;letter-spacing:0}
.info,.patch>div,.dl span{min-width:0;overflow-wrap:anywhere}.desc,.code{overflow-wrap:anywhere}.dl b{flex:none}.dl:hover{transform:none}
.gate{width:min(420px,100%);margin:60px auto;padding:24px;border:1px solid var(--border);background:var(--surface);border-radius:8px}
.gate h1{font-size:1.8rem;margin-bottom:18px}.gate label{display:block;color:var(--muted);margin-bottom:8px}
.gate input{width:100%;font:inherit;padding:12px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:6px;user-select:text}
.gate input:focus-visible,.gate button:focus-visible{outline:2px solid var(--green);outline-offset:3px}
.gate button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:6px;background:var(--green);color:var(--accent-ink);font:inherit;font-weight:700;cursor:pointer}
.gate button:disabled{opacity:.6;cursor:wait}.error{color:var(--error);min-height:24px;margin-top:10px;overflow-wrap:anywhere}
.verify-state{display:flex;align-items:center;justify-content:center;gap:10px;color:var(--green);margin-top:12px}
.spinner{display:inline-block;width:22px;height:22px;border:3px solid var(--border);border-top-color:var(--green);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:700px){h1{font-size:2rem}.patch{gap:24px}.dl{flex-wrap:wrap}.gate{margin:28px auto;padding:20px}}
@media(prefers-reduced-motion:reduce){.spinner{animation-duration:2s}.dl{transition:none}}
`;

/* ===== GERADOR DE PÁGINA INDIVIDUAL (ZIP com HTML, CSS e JS) =====
   A página gerada NÃO contém senha, hash nem dados do Patch: guarda apenas as
   credenciais padrão do Firebase e o ID, e busca tudo no Realtime Database ao abrir. */
const GUARD_CODE = "/* ===== PROTE\u00c7\u00c3O B\u00c1SICA (bot\u00e3o direito e atalhos) ===== */\n(function () {\n  document.addEventListener(\"contextmenu\", function (e) { e.preventDefault(); });\n  document.addEventListener(\"dragstart\", function (e) { if (e.target.tagName === \"IMG\") e.preventDefault(); });\n  document.addEventListener(\"keydown\", function (e) {\n    var k = (e.key || \"\").toLowerCase(), c = e.ctrlKey || e.metaKey;\n    if (k === \"f12\" ||\n        (c && e.shiftKey && [\"i\", \"j\", \"c\", \"k\"].indexOf(k) > -1) ||\n        (c && [\"u\", \"s\", \"p\"].indexOf(k) > -1) ||\n        (e.metaKey && e.altKey && [\"i\", \"j\", \"c\", \"u\"].indexOf(k) > -1)) {\n      e.preventDefault(); e.stopPropagation(); return false;\n    }\n  }, true);\n})();\n";
async function generatePage(id, fallback) {
  const p = fallback || patches[id];
  if (!id || !p) return;
  const zip = new JSZip();
  zip.file("index.html", `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download — PatchHub</title>
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="topbar"><div class="wrap"><span class="brand"><b>▲</b> PATCH<span>HUB</span></span></div></header>
  <main class="wrap">
    <form id="accessForm" class="gate hidden">
      <h1>Patch protegido</h1>
      <label for="accessPassword">Senha de acesso</label>
      <input id="accessPassword" type="password" autocomplete="current-password" required>
      <button id="accessButton" type="submit">Acessar Patch</button>
      <div id="verifyState" class="verify-state hidden" role="status"><span class="spinner" aria-hidden="true"></span>Verificando...</div>
      <p id="accessError" class="error" role="alert"></p>
    </form>
    <p id="status" class="status" role="status">Carregando...</p>
    <section class="patch hidden" id="patch">
      <div class="dvd"><img id="cover" alt=""></div>
      <div class="info">
        <p class="eyebrow">// download oficial</p>
        <h1 id="title"></h1>
        <div class="meta"><span class="code" id="code"></span><span class="size" id="size"></span></div>
        <p class="desc" id="desc"></p>
        <div class="downloads"><h2 id="dlTitle"></h2><div id="links"></div></div>
      </div>
    </section>
  </main>
  <footer class="footer"><div class="wrap">© <span id="year"></span> PatchHub</div></footer>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
  <script src="patch-tools.js"></script>
  <script src="script.js"></script>
</body>
</html>
`);
  zip.file("style.css", PAGE_CSS);
  zip.file("patch-tools.js", "(" + patchToolsExport.toString() + ")();");
  /* O script.js do ZIP leva SOMENTE as credenciais padrão da página principal
     e o ID do Patch. Senha (hash), cor e demais dados vêm do Realtime Database. */
  zip.file("script.js", GUARD_CODE + `
/* Página gerada pelo PatchHub — senha, cor e dados vêm do Realtime Database */
var firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
var PATCH_ID = ${JSON.stringify(id)};
firebase.initializeApp(firebaseConfig);

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var safe = function (u) { return /^https?:\\/\\//i.test(u || "") ? u : "#"; };
  $("year").textContent = new Date().getFullYear();
  PatchTools.applyTheme(PatchTools.GREEN);

  var current = null, unlockedKey = null, unlockedLinks = null;

  function showStatus(text) {
    $("status").textContent = text;
    $("status").classList.remove("hidden");
    $("patch").classList.add("hidden");
  }

  function render(p, links) {
    document.title = p.title + " — Download";
    $("title").textContent = p.title;
    $("cover").src = safe(p.cover);
    $("cover").alt = p.title;
    $("code").textContent = p.code;
    $("size").textContent = p.size + " " + p.unit;
    $("desc").textContent = p.desc;
    $("dlTitle").textContent = "Downloads (" + links.length + ")";
    var box = $("links"); box.innerHTML = "";
    if (!links.length) box.innerHTML = '<p class="muted">Nenhum link disponível.</p>';
    links.forEach(function (l) {
      var a = document.createElement("a");
      a.className = "dl"; a.href = safe(l.url); a.target = "_blank"; a.rel = "noopener noreferrer";
      var s = document.createElement("span"); s.textContent = l.label || "Download";
      var b = document.createElement("b"); b.textContent = "BAIXAR ↓";
      a.appendChild(s); a.appendChild(b); box.appendChild(a);
    });
    $("accessForm").classList.add("hidden");
    $("status").classList.add("hidden");
    $("patch").classList.remove("hidden");
  }

  function update() {
    var p = current;
    if (!p) { $("accessForm").classList.add("hidden"); showStatus("Patch não encontrado ou removido."); return; }
    PatchTools.applyTheme(p.zipColor);
    if (!PatchTools.validLock(p.locked)) { render(p, p.links || []); return; }
    if (!unlockedLinks) {
      $("status").classList.add("hidden");
      $("patch").classList.add("hidden");
      $("accessForm").classList.remove("hidden");
      return;
    }
    render(p, unlockedLinks);
  }

  /* Os links de Patches com senha ficam em vault/{id}/{chave}. A chave só é
     obtida a partir da senha correta; senha errada = caminho inexistente. */
  function openVault(key) {
    return new Promise(function (resolve, reject) {
      var first = true;
      firebase.database().ref("vault/" + PATCH_ID + "/" + key).on("value", function (snap) {
        var v = snap.val();
        if (first) { first = false; resolve(!!v); }
        unlockedLinks = v ? (v.links || []) : null;
        if (!first && current) update();
      }, function (err) { if (first) { first = false; reject(err); } });
    });
  }

  firebase.database().ref("patches/" + PATCH_ID).on("value", function (snap) {
    current = snap.val();
    update();
  }, function () { $("accessForm").classList.add("hidden"); showStatus("Erro ao carregar o Patch."); });

  $("accessForm").onsubmit = async function (event) {
    event.preventDefault();
    if ($("accessButton").disabled || !current || !PatchTools.validLock(current.locked)) return;
    $("accessError").textContent = "";
    $("accessButton").disabled = true;
    $("accessPassword").disabled = true;
    $("verifyState").classList.remove("hidden");
    $("accessForm").setAttribute("aria-busy", "true");
    try {
      var key = await PatchTools.unlockKey($("accessPassword").value, current.locked);
      if (unlockedKey) firebase.database().ref("vault/" + PATCH_ID + "/" + unlockedKey).off();
      unlockedKey = key;
      if (await openVault(key)) { $("accessPassword").value = ""; update(); }
      else {
        firebase.database().ref("vault/" + PATCH_ID + "/" + key).off(); unlockedKey = null;
        $("accessError").textContent = "Senha incorreta. Tente novamente."; $("accessPassword").value = "";
      }
    } catch (error) { $("accessError").textContent = error.message; }
    finally {
      $("accessButton").disabled = false; $("accessPassword").disabled = false;
      $("verifyState").classList.add("hidden"); $("accessForm").removeAttribute("aria-busy");
      if (!unlockedLinks) $("accessPassword").focus();
    }
  };
})();
`);
  const blob = await zip.generateAsync({ type: "blob" });
  const name = (p.code || p.title || "patch").replace(/[^a-z0-9_-]+/gi, "-");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name + ".zip";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
