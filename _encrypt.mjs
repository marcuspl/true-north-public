#!/usr/bin/env node
// Encrypts an HTML file with AES-256-GCM + PBKDF2, wrapping it in a password gate.
// Usage: node _encrypt.mjs <input.html> <output.html> <password> [title]

import { readFileSync, writeFileSync } from 'fs';
import { randomBytes, pbkdf2Sync, createCipheriv } from 'crypto';

const [,, inputPath, outputPath, password, title = 'True North'] = process.argv;
if (!inputPath || !outputPath || !password) {
  console.error('Usage: node _encrypt.mjs <input.html> <output.html> <password> [title]');
  process.exit(1);
}

const plaintext = readFileSync(inputPath, 'utf-8');

// Encrypt
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
const authTag = cipher.getAuthTag();

const payload = JSON.stringify({
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  authTag: authTag.toString('base64'),
  data: encrypted.toString('base64'),
});

const gate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg-deep: #0c1220;
  --gold: #d4a843;
  --gold-dim: rgba(212,168,67,0.25);
  --gold-glow: rgba(212,168,67,0.08);
  --text-primary: #e8ecf2;
  --text-secondary: #a8b9ca;
  --text-muted: #6e8194;
  --border: rgba(255,255,255,0.08);
}
html, body {
  width: 100%; height: 100%;
  background: var(--bg-deep);
  color: var(--text-primary);
  font-family: 'Outfit', sans-serif;
  font-weight: 300;
  -webkit-font-smoothing: antialiased;
  display: flex; align-items: center; justify-content: center;
}
.gate {
  text-align: center;
  max-width: 400px;
  padding: 2rem;
}
.gate svg { width: 48px; height: 48px; margin-bottom: 1.5rem; opacity: 0.7; }
.gate h1 {
  font-family: 'DM Serif Display', serif;
  font-weight: 400; font-size: 1.8rem;
  margin-bottom: 0.3em;
}
.gate h1 .gold { color: var(--gold); }
.gate p { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem; }
.gate input {
  width: 100%; padding: 0.7em 1em;
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-family: 'Outfit', sans-serif;
  font-size: 1rem;
  text-align: center;
  letter-spacing: 0.08em;
  outline: none;
  transition: border-color 0.2s;
}
.gate input:focus { border-color: var(--gold); }
.gate input::placeholder { color: var(--text-muted); letter-spacing: 0.04em; }
.gate .error {
  color: #c44; font-size: 0.82rem;
  margin-top: 0.8rem; opacity: 0;
  transition: opacity 0.3s;
}
.gate .error.show { opacity: 1; }
.gate .hint { color: var(--text-muted); font-size: 0.75rem; margin-top: 1.2rem; }
</style>
</head>
<body>

<div class="gate" id="gate">
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 0 L54 42 L50 38 L46 42 Z" fill="#d4a843" opacity="0.9"/>
    <path d="M100 50 L58 54 L62 50 L58 46 Z" fill="#d4a843" opacity="0.9"/>
    <path d="M50 100 L46 58 L50 62 L54 58 Z" fill="#d4a843" opacity="0.9"/>
    <path d="M0 50 L42 46 L38 50 L42 54 Z" fill="#d4a843" opacity="0.9"/>
    <path d="M50 10 L53 47 L50 44 L47 47 Z" fill="#d4a843" opacity="0.4"/>
    <path d="M90 50 L53 53 L56 50 L53 47 Z" fill="#d4a843" opacity="0.4"/>
    <path d="M50 90 L47 53 L50 56 L53 53 Z" fill="#d4a843" opacity="0.4"/>
    <path d="M10 50 L47 47 L44 50 L47 53 Z" fill="#d4a843" opacity="0.4"/>
    <circle cx="50" cy="50" r="3" fill="#d4a843"/>
  </svg>
  <h1>True <span class="gold">North</span></h1>
  <p>This deck is password-protected.</p>
  <input type="text" id="pw" placeholder="Enter password" autocomplete="off" autofocus>
  <div class="error" id="err">Incorrect password</div>
  <div class="hint">Press Enter to unlock</div>
</div>

<script id="payload" type="application/json">${payload}</script>
<script>
(async function() {
  const input = document.getElementById('pw');
  const err = document.getElementById('err');

  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') { err.classList.remove('show'); return; }
    const pw = input.value;
    try {
      const {salt, iv, authTag, data} = JSON.parse(document.getElementById('payload').textContent);
      const saltBuf = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
      const ivBuf = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
      const tagBuf = Uint8Array.from(atob(authTag), c => c.charCodeAt(0));
      const dataBuf = Uint8Array.from(atob(data), c => c.charCodeAt(0));

      const combined = new Uint8Array(dataBuf.length + tagBuf.length);
      combined.set(dataBuf);
      combined.set(tagBuf, dataBuf.length);

      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        {name: 'PBKDF2', salt: saltBuf, iterations: 100000, hash: 'SHA-256'},
        keyMaterial,
        {name: 'AES-GCM', length: 256},
        false,
        ['decrypt']
      );
      const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv: ivBuf}, key, combined);
      const html = new TextDecoder().decode(decrypted);

      document.open();
      document.write(html);
      document.close();
    } catch(ex) {
      err.classList.add('show');
      input.select();
    }
  });
})();
</script>

</body>
</html>`;

writeFileSync(outputPath, gate);
console.log(`Encrypted: ${inputPath} → ${outputPath}`);
