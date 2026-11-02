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

/* Página gerada pelo PatchHub — os dados vêm do Realtime Database */
var PATCH_ID = "-P5Ptn6iWbndwKcHcpsK";
firebase.initializeApp({
  "apiKey": "AIzaSyA41WO8_8fUBCLt2ZOUcFYAcihqyeG11wU",
  "authDomain": "patches-4096f.firebaseapp.com",
  "databaseURL": "https://patches-4096f-default-rtdb.firebaseio.com",
  "projectId": "patches-4096f",
  "appId": "1:717458444908:web:8b6d7ffb3831b6cb12be49"
});

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var safe = function (u) { return /^https?:\/\//i.test(u || "") ? u : "#"; };
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
