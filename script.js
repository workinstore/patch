/* ===== PROTEÇÃO BÁSICA (botão direito e atalhos) ===== */
(function () {
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("dragstart", function (e) { if (e.target.tagName === "IMG") e.preventDefault(); });
  document.addEventListener("keydown", function (e) {
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
const ADMIN_EMAIL = "admin@admin.com";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database().ref("patches");

const $ = (id) => document.getElementById(id);
let patches = {};
let isAdmin = false;

const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl = (u = "") => /^https?:\/\//i.test(u) ? esc(u) : "#";

$("year").textContent = new Date().getFullYear();

/* ===== AUTENTICAÇÃO ===== */
auth.onAuthStateChanged(user => {
  isAdmin = !!user && user.email === ADMIN_EMAIL;
  if (user && !isAdmin) auth.signOut();
  $("adminPanel").classList.toggle("hidden", !isAdmin);
  $("btnAdmin").classList.toggle("hidden", isAdmin);
  render();
});

$("btnAdmin").onclick = () => $("loginModal").classList.remove("hidden");
$("btnCloseLogin").onclick = () => $("loginModal").classList.add("hidden");
$("btnLogout").onclick = () => auth.signOut();

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("loginError").textContent = "";
  const email = $("lEmail").value.trim().toLowerCase();
  if (email !== ADMIN_EMAIL) { $("loginError").textContent = "Acesso restrito ao administrador."; return; }
  try {
    await auth.signInWithEmailAndPassword(email, $("lPass").value);
    $("loginModal").classList.add("hidden");
    $("lPass").value = "";
  } catch {
    $("loginError").textContent = "E-mail ou senha inválidos.";
  }
};

/* ===== BANCO DE DADOS ===== */
db.on("value", snap => {
  patches = snap.val() || {};
  render();
}, err => { $("status").textContent = "Erro ao carregar: " + err.message; });

function render() {
  const q = $("search").value.trim().toLowerCase();
  const list = Object.entries(patches)
    .filter(([, p]) => !q || p.title?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q))
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  $("status").textContent = list.length ? "" : (q ? "Nenhum resultado encontrado." : "Nenhum Patch publicado ainda.");
  $("status").classList.toggle("hidden", !!list.length);

  $("grid").innerHTML = list.map(([id, p]) => `
    <article class="card" data-id="${id}">
      <div class="dvd"><img src="${safeUrl(p.cover)}" alt="${esc(p.title)}" loading="lazy"></div>
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
  if (del) { if (confirm("Excluir este Patch?")) db.child(del).remove(); return; }
  const card = e.target.closest(".card");
  if (card) openDetail(card.dataset.id);
};

/* ===== DETALHES ===== */
function openDetail(id) {
  const p = patches[id]; if (!p) return;
  const links = p.links || [];
  $("detailContent").innerHTML = `
    <div class="detail">
      <div class="dvd"><img src="${safeUrl(p.cover)}" alt="${esc(p.title)}"></div>
      <div>
        <h2>${esc(p.title)}</h2>
        <div class="meta" style="justify-content:flex-start;gap:14px">
          <span class="code">${esc(p.code)}</span><span class="size">${esc(p.size)} ${esc(p.unit)}</span>
        </div>
        <p class="desc">${esc(p.desc)}</p>
        <div class="downloads">
          <h4>Downloads (${links.length})</h4>
          ${links.length ? links.map(l => `
            <a class="dl" href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">
              <span>${esc(l.label || "Download")}</span><b>BAIXAR ↓</b>
            </a>`).join("") : `<p class="muted">Nenhum link disponível.</p>`}
        </div>
      </div>
    </div>`;
  $("detailModal").classList.remove("hidden");
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

function resetForm() {
  $("patchForm").reset();
  $("patchId").value = "";
  $("linksList").innerHTML = "";
  addLinkRow();
  $("formTitle").textContent = "Novo Patch";
}
$("btnCancel").onclick = resetForm;

function startEdit(id) {
  const p = patches[id]; if (!p) return;
  $("patchId").value = id;
  $("fTitle").value = p.title || "";
  $("fCode").value = p.code || "";
  $("fCover").value = p.cover || "";
  $("fSize").value = p.size || "";
  $("fUnit").value = p.unit || "GB";
  $("fDesc").value = p.desc || "";
  $("linksList").innerHTML = "";
  (p.links?.length ? p.links : [{}]).forEach(l => addLinkRow(l.label, l.url));
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

  const data = {
    title: $("fTitle").value.trim(),
    code,
    cover: $("fCover").value.trim(),
    size: parseFloat($("fSize").value),
    unit: $("fUnit").value,
    desc: $("fDesc").value.trim(),
    links,
    updatedAt: Date.now()
  };
  try {
    let savedId = id;
    if (id) await db.child(id).update(data);
    else savedId = (await db.push({ ...data, createdAt: Date.now() })).key;
    const gen = e.submitter && e.submitter.id === "btnSaveGen";
    resetForm();
    if (gen) await generatePage(savedId, data); else alert("Patch salvo com sucesso!");
  } catch (err) { alert("Erro ao salvar: " + err.message); }
};

resetForm();

const PAGE_CSS = ":root{--bg:#07090a;--surface:#0e1211;--surface-2:#141a18;--border:#1f2a26;--text:#e6efe9;--muted:#8a9a92;--green:#22e07a;--green-dim:#15a85a;--glow:rgba(34,224,122,.25)}\n*{box-sizing:border-box;margin:0;padding:0}\nbody{background:var(--bg);color:var(--text);font-family:'Rajdhani',sans-serif;font-size:17px;line-height:1.5;min-height:100vh;display:flex;flex-direction:column;background-image:radial-gradient(ellipse at top,rgba(34,224,122,.08),transparent 55%)}\nmain{flex:1}\na{color:inherit;text-decoration:none}\n.wrap{width:min(1000px,92%);margin:0 auto}\n.topbar{border-bottom:1px solid var(--border);height:64px;display:flex;align-items:center}\n.brand{font-weight:700;font-size:1.4rem;letter-spacing:2px}\n.brand b,.brand span{color:var(--green)}\n.patch{display:grid;grid-template-columns:300px 1fr;gap:40px;padding:48px 0 60px}\n.dvd{position:relative;aspect-ratio:135/190;border-radius:4px;overflow:hidden;background:#000;box-shadow:0 20px 40px -10px var(--glow),0 6px 18px rgba(0,0,0,.6);border:1px solid var(--border)}\n.dvd::before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:7%;background:linear-gradient(90deg,rgba(255,255,255,.15),rgba(0,0,0,.4));z-index:1}\n.dvd::after{content:\"DVD\";position:absolute;top:0;left:0;right:0;background:var(--green);color:#03140a;font-weight:700;font-size:12px;letter-spacing:4px;text-align:center;padding:3px 0;z-index:2}\n.dvd img{width:100%;height:100%;object-fit:cover;display:block}\n.eyebrow{font-family:'JetBrains Mono',monospace;color:var(--green);font-size:13px;margin-bottom:6px}\nh1{font-size:clamp(2rem,5vw,2.8rem);line-height:1.1}\n.meta{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:14px}\n.code{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--green);background:rgba(34,224,122,.08);border:1px solid rgba(34,224,122,.25);padding:3px 10px;border-radius:4px}\n.size{color:var(--muted);font-weight:600}\n.desc{color:var(--muted);white-space:pre-line;margin:20px 0 28px}\n.downloads h2{color:var(--green);letter-spacing:2px;text-transform:uppercase;font-size:15px;margin-bottom:12px}\n.dl{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;background:var(--surface-2);transition:all .2s}\n.dl:hover{border-color:var(--green);box-shadow:0 0 20px var(--glow);transform:translateX(4px)}\n.dl span{font-weight:600}\n.dl b{background:var(--green);color:#03140a;padding:5px 12px;border-radius:6px;font-size:13px;letter-spacing:1px;white-space:nowrap}\n.muted{color:var(--muted)}\n.footer{border-top:1px solid var(--border);padding:20px 0;color:var(--muted);font-size:14px;text-align:center}\n@media(max-width:700px){.patch{grid-template-columns:1fr;gap:24px;padding:28px 0 40px}.dvd{max-width:220px;margin:0 auto;width:100%}}\n.hidden{display:none!important}\n.status{text-align:center;color:var(--muted);padding:80px 0}\nbody{-webkit-user-select:none;user-select:none}\n";

/* ===== GERADOR DE PÁGINA INDIVIDUAL (ZIP com HTML, CSS e JS) =====
   A página gerada NÃO contém dados do Patch: guarda apenas o ID e busca
   tudo (título, capa, links...) no Realtime Database ao abrir. */
const GUARD_CODE = "/* ===== PROTE\u00c7\u00c3O B\u00c1SICA (bot\u00e3o direito e atalhos) ===== */\n(function () {\n  document.addEventListener(\"contextmenu\", function (e) { e.preventDefault(); });\n  document.addEventListener(\"dragstart\", function (e) { if (e.target.tagName === \"IMG\") e.preventDefault(); });\n  document.addEventListener(\"keydown\", function (e) {\n    var k = (e.key || \"\").toLowerCase(), c = e.ctrlKey || e.metaKey;\n    if (k === \"f12\" ||\n        (c && e.shiftKey && [\"i\", \"j\", \"c\", \"k\"].indexOf(k) > -1) ||\n        (c && [\"u\", \"s\", \"p\"].indexOf(k) > -1) ||\n        (e.metaKey && e.altKey && [\"i\", \"j\", \"c\", \"u\"].indexOf(k) > -1)) {\n      e.preventDefault(); e.stopPropagation(); return false;\n    }\n  }, true);\n})();\n";
async function generatePage(id, fallback) {
  const p = patches[id] || fallback;
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
    <p id="status" class="status">Carregando...</p>
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
  <script src="script.js"></script>
</body>
</html>
`);
  zip.file("style.css", PAGE_CSS);
  const cfg = { apiKey: firebaseConfig.apiKey, authDomain: firebaseConfig.authDomain, databaseURL: firebaseConfig.databaseURL, projectId: firebaseConfig.projectId, appId: firebaseConfig.appId };
  zip.file("script.js", GUARD_CODE + `
/* Página gerada pelo PatchHub — os dados vêm do Realtime Database */
var PATCH_ID = ${JSON.stringify(id)};
firebase.initializeApp(${JSON.stringify(cfg, null, 2)});

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var safe = function (u) { return /^https?:\\/\\//i.test(u || "") ? u : "#"; };
  $("year").textContent = new Date().getFullYear();
  firebase.database().ref("patches/" + PATCH_ID).on("value", function (snap) {
    var p = snap.val();
    if (!p) { $("status").textContent = "Patch não encontrado ou removido."; $("status").classList.remove("hidden"); $("patch").classList.add("hidden"); return; }
    var links = p.links || [];
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
    $("status").classList.add("hidden"); $("patch").classList.remove("hidden");
  }, function () { $("status").textContent = "Erro ao carregar o Patch."; });
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
