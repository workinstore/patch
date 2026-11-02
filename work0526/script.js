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

/* Página gerada pelo PatchHub — senha, cor e dados vêm do Realtime Database */
var firebaseConfig = {
  "apiKey": "AIzaSyA41WO8_8fUBCLt2ZOUcFYAcihqyeG11wU",
  "authDomain": "patches-4096f.firebaseapp.com",
  "databaseURL": "https://patches-4096f-default-rtdb.firebaseio.com",
  "projectId": "patches-4096f",
  "storageBucket": "patches-4096f.firebasestorage.app",
  "messagingSenderId": "717458444908",
  "appId": "1:717458444908:web:8b6d7ffb3831b6cb12be49"
};
var PATCH_ID = "-P5Ptn6iWbndwKcHcpsK";
firebase.initializeApp(firebaseConfig);

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var safe = function (u) { return /^https?:\/\//i.test(u || "") ? u : "#"; };
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
