(function () {
  "use strict";
  const KEY = "zamhse_draft";
  const root = document.getElementById("root");
  const statusEl = document.getElementById("status");
  let data;
  let pendingAuth = null;
  const thumbs = {}; // image path -> data URL (shown right after upload, before GitHub Pages serves it)

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    kids.flat().forEach((c) => n.append(c instanceof Node ? c : document.createTextNode(c)));
    return n;
  }
  const say = (m) => (statusEl.textContent = m);
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); say("Draft saved " + new Date().toLocaleTimeString()); }
    catch (e) { say("Could not save draft in this browser"); }
  }

  /* ================= Password gate ================= */
  const b64e = (u8) => btoa(String.fromCharCode(...u8));
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function hashPw(pw, saltB64) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64d(saltB64), iterations: 250000, hash: "SHA-256" }, key, 256);
    return b64e(new Uint8Array(bits));
  }
  async function makeAuth(pw) {
    const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
    return { salt, hash: await hashPw(pw, salt) };
  }
  async function loadLive() {
    const r = await fetch("content.json?v=" + Date.now());
    if (!r.ok) throw new Error("content.json not found");
    return r.json();
  }
  function gate(live) {
    return new Promise((resolve) => {
      if (sessionStorage.getItem("zamhse_ok") === "1") return resolve();
      const auth = live.adminAuth;
      const pw = el("input", { type: "password", placeholder: auth ? "Password" : "Choose a password (10+ characters)", autocomplete: auth ? "current-password" : "new-password" });
      const pw2 = auth ? null : el("input", { type: "password", placeholder: "Repeat password", autocomplete: "new-password" });
      const msg = el("p", { class: "hint" }, "");
      const btn = el("button", { type: "submit" }, auth ? "Unlock" : "Create password");
      const form = el("form", { class: "panel", onsubmit: async (e) => {
        e.preventDefault();
        if (!window.crypto || !crypto.subtle) { msg.textContent = "This page must be opened over https (your live site) to use the password."; return; }
        btn.disabled = true;
        try {
          if (auth) {
            if ((await hashPw(pw.value, auth.salt)) === auth.hash) { sessionStorage.setItem("zamhse_ok", "1"); resolve(); return; }
            msg.textContent = "Wrong password.";
            setTimeout(() => (btn.disabled = false), 1500);
          } else {
            if (pw.value.length < 10) { msg.textContent = "Use at least 10 characters."; btn.disabled = false; return; }
            if (pw.value !== pw2.value) { msg.textContent = "Passwords do not match."; btn.disabled = false; return; }
            pendingAuth = await makeAuth(pw.value);
            sessionStorage.setItem("zamhse_ok", "1");
            resolve();
          }
        } catch (err) { msg.textContent = "Error: " + err.message; btn.disabled = false; }
      } },
        el("h2", {}, auth ? "Admin login" : "Set an admin password"),
        auth ? "" : el("p", { class: "hint" }, "No password is set yet. Create one now, then press Publish to GitHub so it takes effect."),
        pw, pw2 || "", el("div", { class: "bar" }, btn), msg);
      root.textContent = "";
      root.append(form);
      say("Locked");
    });
  }

  /* ================= Field helpers ================= */
  function field(label, obj, key, opts) {
    opts = opts || {};
    const input = opts.rows ? el("textarea", { rows: opts.rows }) : el("input", { type: "text" });
    input.value = obj[key] == null ? "" : obj[key];
    input.addEventListener("input", () => { obj[key] = input.value; save(); });
    return el("div", {}, el("label", {}, label), input, opts.hint ? el("p", { class: "hint" }, opts.hint) : "");
  }
  function linesField(label, obj, key, hint) {
    const ta = el("textarea", { rows: 6 });
    ta.value = (obj[key] || []).join("\n");
    ta.addEventListener("input", () => { obj[key] = ta.value.split("\n"); save(); });
    return el("div", {}, el("label", {}, label), ta, el("p", { class: "hint" }, hint));
  }
  function move(arr, i, d) {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    save(); render();
  }
  function controls(arr, i, what) {
    return el("div", { class: "bar", style: "margin:0" },
      el("button", { class: "small ghost", type: "button", onclick: () => move(arr, i, -1) }, "↑"),
      el("button", { class: "small ghost", type: "button", onclick: () => move(arr, i, 1) }, "↓"),
      el("button", { class: "small danger", type: "button", onclick: () => {
        if (confirm("Delete this " + what + "?")) { arr.splice(i, 1); save(); render(); }
      } }, "Delete"));
  }
  const addBtn = (text, fn) => el("button", { class: "small", type: "button", onclick: fn }, text);
  const slug = (s) => (s || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";

  /* ================= GitHub helpers ================= */
  const ghCfg = () => { try { return JSON.parse(localStorage.getItem("zamhse_gh") || "{}"); } catch (e) { return {}; } };
  const ghToken = () => sessionStorage.getItem("zamhse_token") || "";
  const ghHeaders = () => ({ Authorization: "Bearer " + ghToken(), Accept: "application/vnd.github+json" });

  function readAsBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error("Could not read image"));
      r.readAsDataURL(blob);
    });
  }
  async function resizeToJpeg(file, maxW) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxW / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not convert image"))), "image/jpeg", 0.82));
  }
  async function uploadImage(file, name) {
    const cfg = ghCfg();
    if (!cfg.owner || !cfg.repo || !ghToken()) throw new Error("Fill in your GitHub details in the Publish panel at the bottom first.");
    const blob = await resizeToJpeg(file, 900);
    const dataUrl = await readAsBase64(blob);
    const path = "images/" + slug(name) + "-" + Date.now().toString(36) + ".jpg";
    const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify({ message: "Add product image", content: dataUrl.split(",")[1], branch: cfg.branch || "main" })
    });
    if (!r.ok) throw new Error("Upload failed (" + r.status + "): " + ((await r.json()).message || ""));
    thumbs[path] = dataUrl;
    return path;
  }

  /* ================= Panels ================= */
  function panelSite() {
    return el("div", { class: "panel" }, el("h2", {}, "Site details"),
      el("div", { class: "row" },
        field("Business name", data.site, "name"),
        field("Order form URL (n8n)", data.site, "orderFormUrl"),
        field("WhatsApp number (country code, no +)", data.site, "whatsapp"),
        field("Phone shown on site", data.site, "phoneDisplay"),
        field("Email", data.site, "email"),
        field("Location", data.site, "location")));
  }
  function panelHero() {
    return el("div", { class: "panel" }, el("h2", {}, "Homepage banner"),
      field("Small heading", data.hero, "eyebrow"),
      field("Main headline", data.hero, "title"),
      field("Intro text", data.hero, "lead", { rows: 3 }),
      field("Text above the catalog", data, "catalogIntro", { rows: 2 }));
  }

  function productItem(sec, p, pi) {
    const thumb = el("img", { class: "thumb", alt: "" });
    const src = thumbs[p.image] || p.image;
    if (src) thumb.src = src; else thumb.style.display = "none";
    const file = el("input", { type: "file", accept: "image/*" });
    const st = el("p", { class: "hint" }, "Choose a photo and press Upload. It is resized and saved in your repository's images folder.");
    const up = el("button", { class: "small ghost", type: "button", onclick: async () => {
      if (!file.files[0]) { st.textContent = "Choose a photo first."; return; }
      st.textContent = "Uploading…";
      try { p.image = await uploadImage(file.files[0], p.name); save(); render(); say("Image uploaded"); }
      catch (e) { st.textContent = "Error: " + e.message; }
    } }, "Upload image");
    return el("div", { class: "item" },
      el("div", { class: "item-head" }, el("strong", {}, "Product: " + (p.name || "New product")), controls(sec.products, pi, "product")),
      el("div", { class: "row" }, field("Name", p, "name"), field("Price", p, "price", { hint: "For example K250. Leave empty to show 'Ask for a quote'." })),
      field("Description", p, "description", { rows: 2 }),
      field("Image path or URL", p, "image", { hint: "Filled in automatically after upload. You can also paste a web link." }),
      thumb, el("div", { class: "bar" }, file, up), st);
  }

  function panelSections() {
    const p = el("div", { class: "panel" }, el("h2", {}, "Sections, products & templates"));
    data.sections.forEach((sec, si) => {
      sec.templates = sec.templates || [];
      sec.products = sec.products || [];
      const box = el("div", { class: "item sec" },
        el("div", { class: "item-head" }, el("strong", {}, `${sec.icon || ""} ${sec.title || "New section"}`), controls(data.sections, si, "section")),
        el("div", { class: "row" }, field("Section title", sec, "title"), field("Icon (emoji)", sec, "icon")),
        field("Description", sec, "description", { rows: 2 }));

      box.append(el("h3", { style: "margin:16px 0 0;font-size:.95rem" }, "Products & services"));
      sec.products.forEach((pr, pi) => box.append(productItem(sec, pr, pi)));
      box.append(el("div", { class: "bar" }, addBtn("+ Add product", () => {
        sec.products.push({ name: "New product", description: "", price: "", image: "" }); save(); render();
      })));

      box.append(el("h3", { style: "margin:16px 0 0;font-size:.95rem" }, "Document templates (preview only)"));
      sec.templates.forEach((t, ti) => {
        box.append(el("div", { class: "item" },
          el("div", { class: "item-head" }, el("strong", {}, "Template: " + (t.name || "New template")), controls(sec.templates, ti, "template")),
          el("div", { class: "row" }, field("Template name", t, "name"), field("Price (optional)", t, "price", { hint: "For example K50. Leave empty to hide." })),
          field("Short description", t, "description"),
          linesField("Preview content (one line per row)", t, "preview",
            "Start a line with '# ' for a heading, '- ' for a bullet, '[ ] ' for a checkbox. Show only a small sample. This page is public, so never paste the full template.")));
      });
      box.append(el("div", { class: "bar" }, addBtn("+ Add template", () => {
        sec.templates.push({ name: "New template", description: "", price: "", preview: ["# TITLE", "Full template available on request."] }); save(); render();
      })));
      p.append(box);
    });
    p.append(el("div", { class: "bar" }, addBtn("+ Add section", () => {
      data.sections.push({ id: "section-" + Date.now(), title: "New section", icon: "📦", description: "", products: [], templates: [] });
      save(); render();
    })));
    return p;
  }

  function panelList(title, key, fields, blank, labelKey) {
    const p = el("div", { class: "panel" }, el("h2", {}, title));
    data[key].forEach((it, i) => {
      p.append(el("div", { class: "item" },
        el("div", { class: "item-head" }, el("strong", {}, it[labelKey] || "Item"), controls(data[key], i, "item")),
        fields.map(([lab, k, rows]) => field(lab, it, k, rows ? { rows } : {}))));
    });
    p.append(el("div", { class: "bar" }, addBtn("+ Add", () => { data[key].push(Object.assign({}, blank)); save(); render(); })));
    return p;
  }

  function panelPassword() {
    const a = el("input", { type: "password", placeholder: "New password (10+ characters)", autocomplete: "new-password" });
    const b = el("input", { type: "password", placeholder: "Repeat new password", autocomplete: "new-password" });
    const msg = el("p", { class: "hint" }, "");
    return el("div", { class: "panel" }, el("h2", {}, "Admin password"),
      el("p", { class: "hint" }, "This password only locks the admin page for casual visitors. Your real protection is your GitHub token, because nobody can change the live site without it. Use a long, unique password."),
      a, b,
      el("div", { class: "bar" },
        el("button", { type: "button", onclick: async () => {
          if (a.value.length < 10) { msg.textContent = "Use at least 10 characters."; return; }
          if (a.value !== b.value) { msg.textContent = "Passwords do not match."; return; }
          data.adminAuth = await makeAuth(a.value); save();
          msg.textContent = "New password saved to your draft. Press Publish to GitHub to make it live.";
          a.value = ""; b.value = "";
        } }, "Change password"),
        el("button", { class: "ghost", type: "button", onclick: () => { sessionStorage.removeItem("zamhse_ok"); location.reload(); } }, "Lock now")),
      msg);
  }

  function panelPublish() {
    const cfg = ghCfg();
    const inOwner = el("input", { type: "text", placeholder: "your-github-username" });
    const inRepo = el("input", { type: "text", placeholder: "repository-name" });
    const inBranch = el("input", { type: "text", placeholder: "main" });
    const inToken = el("input", { type: "password", placeholder: "GitHub personal access token" });
    inOwner.value = cfg.owner || ""; inRepo.value = cfg.repo || ""; inBranch.value = cfg.branch || "main"; inToken.value = ghToken();
    const persist = () => {
      localStorage.setItem("zamhse_gh", JSON.stringify({ owner: inOwner.value.trim(), repo: inRepo.value.trim(), branch: inBranch.value.trim() || "main" }));
      sessionStorage.setItem("zamhse_token", inToken.value.trim());
    };
    [inOwner, inRepo, inBranch, inToken].forEach((i) => i.addEventListener("input", persist));
    const out = el("p", { class: "hint" }, "");

    async function publish() {
      persist();
      const c = ghCfg();
      if (!c.owner || !c.repo || !ghToken()) { out.textContent = "Fill in username, repository and token."; return; }
      out.textContent = "Publishing…";
      const api = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/content.json`;
      try {
        let sha;
        const g = await fetch(`${api}?ref=${encodeURIComponent(c.branch)}`, { headers: ghHeaders() });
        if (g.ok) sha = (await g.json()).sha;
        else if (g.status !== 404) throw new Error("Could not read repo (" + g.status + "). Check username, repo name and token.");
        const body = {
          message: "Update site content from admin",
          content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2) + "\n"))),
          branch: c.branch
        };
        if (sha) body.sha = sha;
        const r = await fetch(api, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()), body: JSON.stringify(body) });
        if (!r.ok) throw new Error("Publish failed (" + r.status + "): " + ((await r.json()).message || ""));
        out.textContent = "Published. GitHub Pages updates the live site in about a minute.";
      } catch (e) { out.textContent = "Error: " + e.message; }
    }

    return el("div", { class: "panel" }, el("h2", {}, "Publish to GitHub"),
      el("p", { class: "hint" }, "Create a token at GitHub > Settings > Developer settings > Fine-grained tokens, for this repository only, with Contents: Read and write. It is kept in this browser tab only and never saved to the site. The same details are used for image uploads above."),
      el("div", { class: "row" },
        el("div", {}, el("label", {}, "GitHub username"), inOwner),
        el("div", {}, el("label", {}, "Repository"), inRepo),
        el("div", {}, el("label", {}, "Branch"), inBranch),
        el("div", {}, el("label", {}, "Token"), inToken)),
      el("div", { class: "bar" },
        el("button", { type: "button", onclick: publish }, "Publish to GitHub"),
        el("button", { class: "ghost", type: "button", onclick: () => {
          if (confirm("Discard your unpublished draft and reload the live content?")) { localStorage.removeItem(KEY); location.reload(); }
        } }, "Discard draft")),
      out);
  }

  function render() {
    root.textContent = "";
    root.append(
      panelSite(), panelHero(), panelSections(),
      panelList("How it works (steps)", "steps", [["Title", "title"], ["Text", "text", 2]], { title: "New step", text: "" }, "title"),
      panelList("FAQ", "faq", [["Question", "q"], ["Answer", "a", 3]], { q: "New question", a: "" }, "q"),
      panelPassword(), panelPublish());
  }

  document.getElementById("dl").addEventListener("click", () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "content.json" });
    document.body.append(a); a.click(); a.remove();
  });

  (async function init() {
    try {
      const live = await loadLive();
      await gate(live);
      const d = localStorage.getItem(KEY);
      data = d ? JSON.parse(d) : live;
      if (pendingAuth) { data.adminAuth = pendingAuth; save(); }
      say(d ? "Editing your saved draft" : "Loaded live content");
      render();
    } catch (e) {
      root.textContent = "";
      root.append(el("div", { class: "panel" }, "Could not load content.json. Open this page from your published site, not from a file on your computer."));
      say("Error");
    }
  })();
})();
