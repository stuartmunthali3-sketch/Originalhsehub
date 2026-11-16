(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

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

  async function loadData() {
    // ?draft=1 previews unpublished changes saved by the admin page (same browser only)
    if (new URLSearchParams(location.search).get("draft")) {
      try {
        const d = localStorage.getItem("zamhse_draft");
        if (d) return JSON.parse(d);
      } catch (e) {}
    }
    const r = await fetch("content.json?v=" + Date.now());
    if (!r.ok) throw new Error("content.json not found");
    return r.json();
  }

  /* ---------- Menu ---------- */
  const menuBtn = $("menuBtn"), nav = $("nav");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  nav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => nav.classList.remove("open"))
  );
  $("year").textContent = new Date().getFullYear();

  /* ---------- Preview modal (view only) ---------- */
  const modal = $("modal");
  let site = {};

  function renderPaper(lines) {
    const paper = $("paper");
    paper.textContent = "";
    let ul = null;
    (lines || []).forEach((line) => {
      line = String(line);
      if (line.startsWith("- ")) {
        if (!ul) { ul = el("ul"); paper.append(ul); }
        ul.append(el("li", {}, line.slice(2)));
        return;
      }
      ul = null;
      if (line.startsWith("# ")) paper.append(el("h4", {}, line.slice(2)));
      else if (line.startsWith("[ ] ")) paper.append(el("div", { class: "chk" }, "☐ " + line.slice(4)));
      else paper.append(el("p", {}, line));
    });
  }

  function openPreview(sec, t) {
    $("modalTitle").textContent = t.name;
    renderPaper(t.preview);
    const msg = `Hello ${site.name}, I would like to request the full template: "${t.name}" (${sec.title}).`;
    $("reqWa").href = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(msg)}`;
    $("reqMail").href = `mailto:${site.email}?subject=${encodeURIComponent("Template request: " + t.name)}&body=${encodeURIComponent(msg)}`;
    modal.hidden = false;
    document.body.classList.add("no-scroll");
  }
  function closePreview() {
    modal.hidden = true;
    document.body.classList.remove("no-scroll");
  }
  $("modalClose").addEventListener("click", closePreview);
  modal.addEventListener("click", (e) => { if (e.target === modal) closePreview(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePreview();
    // Discourage save / print / copy shortcuts while a preview is open
    if (!modal.hidden && (e.ctrlKey || e.metaKey) && ["s", "p", "c", "a", "u"].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  });
  // Block right-click, copy, drag and print inside the preview
  ["contextmenu", "copy", "cut", "dragstart", "selectstart"].forEach((ev) =>
    $("paper").addEventListener(ev, (e) => e.preventDefault())
  );
  window.addEventListener("beforeprint", () => closePreview());

  /* ---------- Render ---------- */
  function render(data) {
    site = data.site;
    document.title = `${site.name} | HSE Products, Services & Templates in Zambia`;
    $("brandText").textContent = site.name;
    $("footName").textContent = site.name;

    $("heroEyebrow").textContent = data.hero.eyebrow;
    $("heroTitle").textContent = data.hero.title;
    $("heroLead").textContent = data.hero.lead;
    $("catalogIntro").textContent = data.catalogIntro || "";

    // Sections + templates
    const wrap = $("sections");
    wrap.textContent = "";
    data.sections.forEach((sec) => {
      const head = el("div", { class: "sec-head" },
        el("span", { class: "icon" }, sec.icon || ""),
        el("div", {}, el("h3", {}, sec.title), el("p", {}, sec.description))
      );
      const pgrid = el("div", { class: "prod-grid" });
      (sec.products || []).forEach((p) => {
        const media = p.image
          ? el("img", { src: p.image, alt: p.name, loading: "lazy" })
          : el("div", { class: "ph", "aria-hidden": "true" }, sec.icon || "📦");
        pgrid.append(
          el("article", { class: "prod" }, media,
            el("div", { class: "prod-body" },
              el("h4", {}, p.name),
              el("p", {}, p.description || ""),
              p.price ? el("span", { class: "price" }, p.price) : el("span", { class: "price ask" }, "Ask for a quote"),
              el("a", {
                class: "btn btn-small", target: "_blank", rel: "noopener",
                href: `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(`Hello ${site.name}, I would like to order / get a quote for: ${p.name}. Quantity: `)}`
              }, "Order / Quote")
            )
          )
        );
      });
      const grid = el("div", { class: "tpl-grid" });
      (sec.templates || []).forEach((t) => {
        grid.append(
          el("article", { class: "tpl" },
            el("div", { class: "tpl-top" }, el("span", { class: "badge" }, "Template"), t.price ? el("span", { class: "price" }, t.price) : ""),
            el("h4", {}, t.name),
            el("p", {}, t.description || ""),
            el("div", { class: "tpl-actions" },
              el("button", { class: "btn btn-small btn-ghost", type: "button", onclick: () => openPreview(sec, t) }, "Preview"),
              el("a", {
                class: "btn btn-small",
                target: "_blank", rel: "noopener",
                href: `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(`Hello ${site.name}, I would like the template: "${t.name}" (${sec.title}).`)}`
              }, "Request")
            )
          )
        );
      });
      const parts = [head];
      if ((sec.products || []).length) parts.push(el("h5", { class: "sub" }, "Products & services"), pgrid);
      if ((sec.templates || []).length) parts.push(el("h5", { class: "sub" }, "Document templates (preview only)"), grid);
      if (parts.length === 1) parts.push(el("p", { class: "muted" }, "Coming soon."));
      wrap.append(el("div", { class: "sec", id: "sec-" + sec.id }, ...parts));
    });

    // Steps
    const steps = $("steps");
    steps.textContent = "";
    data.steps.forEach((s, i) =>
      steps.append(el("li", {}, el("span", {}, String(i + 1)), el("h3", {}, s.title), el("p", {}, s.text)))
    );

    // FAQ
    const faq = $("faqList");
    faq.textContent = "";
    data.faq.forEach((f) =>
      faq.append(el("details", {}, el("summary", {}, f.q), el("p", {}, f.a)))
    );

    // Contact
    const cl = $("contactList");
    cl.textContent = "";
    cl.append(
      el("li", {}, el("strong", {}, "Phone / WhatsApp: "), el("a", { href: `https://wa.me/${site.whatsapp}` }, site.phoneDisplay)),
      el("li", {}, el("strong", {}, "Email: "), el("a", { href: `mailto:${site.email}` }, site.email)),
      el("li", {}, el("strong", {}, "Location: "), site.location)
    );

    // Form + WhatsApp float
    $("orderForm").src = site.orderFormUrl;
    $("formLink").href = site.orderFormUrl;
    $("waFloat").href = `https://wa.me/${site.whatsapp}`;
  }

  loadData().then(render).catch(() => {
    $("heroTitle").textContent = "Site content could not be loaded.";
    $("heroLead").textContent = "If you opened this file directly from your computer, publish it on GitHub Pages or run a local web server.";
  });
})();
