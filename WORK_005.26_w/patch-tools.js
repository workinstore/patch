(function patchToolsExport() {
  const root = globalThis;
  const GREEN = '#22e07a', CYAN = '#22d3ee';
  function normalizeColor(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : GREEN; }
  function rgb(value) { return normalizeColor(value).slice(1).match(/../g).map(n => parseInt(n, 16)); }
  function fromRgb(values) { return '#' + values.map(n => Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16).padStart(2, '0')).join(''); }
  function hueColor(hue) {
    const h = ((Number(hue) % 360) + 360) % 360 / 60;
    const x = Math.round(255 * (1 - Math.abs(h % 2 - 1)));
    return fromRgb([[255,x,0],[x,255,0],[0,255,x],[0,x,255],[x,0,255],[255,0,x]][Math.floor(h)]);
  }
  function colorHue(value) {
    const [r,g,b] = rgb(value), max = Math.max(r,g,b), d = max - Math.min(r,g,b);
    if (!d) return 0;
    return Math.round((((max === r ? (g-b)/d : max === g ? (b-r)/d+2 : (r-g)/d+4) * 60) + 360) % 360);
  }
  function applyTheme(value, element = document.documentElement) {
    const color = normalizeColor(value), values = rgb(color);
    const luminance = values.map(n => { n /= 255; return n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4; });
    const light = luminance[0]*.2126 + luminance[1]*.7152 + luminance[2]*.0722;
    element.style.setProperty('--green', color);
    element.style.setProperty('--glow', 'rgba(' + values.join(',') + ',.25)');
    element.style.setProperty('--accent-soft', 'rgba(' + values.join(',') + ',.08)');
    element.style.setProperty('--accent-border', 'rgba(' + values.join(',') + ',.25)');
    element.style.setProperty('--accent-ink', light > .179 ? '#07090a' : '#ffffff');
  }
  function requireCrypto() {
    if (!root.crypto || !root.crypto.subtle) throw new Error('Abra em HTTPS ou localhost para usar a proteção por senha.');
  }
  const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  const bytes = text => new Uint8Array(text.match(/../g).map(n => parseInt(n, 16)));
  async function derive(password, salt, iterations) {
    requireCrypto();
    const key = await root.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return hex(new Uint8Array(await root.crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations},key,256)));
  }
  /* A senha nunca é guardada (nem o hash). O PBKDF2 da senha vira a CHAVE secreta
     do caminho vault/{id}/{chave} onde ficam os links. Senha errada = caminho inexistente. */
  function validLock(l) {
    return !!l && l.version === 1 && l.iterations === 210000 && /^[a-f0-9]{32}$/.test(l.salt || '');
  }
  async function createLock(password) {
    requireCrypto();
    if (!password) throw new Error('Informe a senha do Patch.');
    const lock = {version:1, salt:hex(root.crypto.getRandomValues(new Uint8Array(16))), iterations:210000};
    return {lock, key: await derive(password, lock.salt, lock.iterations)};
  }
  async function unlockKey(password, lock) {
    if (!validLock(lock)) throw new Error('Configuração de senha inválida.');
    if (!password) throw new Error('Informe a senha.');
    return derive(password, lock.salt, lock.iterations);
  }
  /* Converte o formato antigo (hash salvo no banco) para o novo, sem precisar da senha. */
  function legacyKey(p) {
    const ok = p && p.version === 1 && p.iterations === 210000 && /^[a-f0-9]{32}$/.test(p.salt) && Array.isArray(p.hashParts) && p.hashParts.length === 8 && p.hashParts.every(v => /^[a-f0-9]{8}$/.test(v));
    return ok ? {lock:{version:1, salt:p.salt, iterations:210000}, key:p.hashParts.slice().reverse().join('')} : null;
  }
  root.PatchTools = {GREEN,CYAN,normalizeColor,rgb,fromRgb,hueColor,colorHue,applyTheme,validLock,createLock,unlockKey,legacyKey};
})();