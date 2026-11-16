# ZamHSE Website

Static site for ZamHSE. Everything you see on the page (text, sections, templates, FAQ, contact details) comes from `content.json`, which you edit from `admin.html`.

## Files
- `index.html`, `styles.css`, `app.js` – the public site
- `content.json` – all site content
- `admin.html`, `admin.js` – your editing page (open `https://<your-site>/admin.html`)
- `favicon.svg`

## Deploy on GitHub Pages
1. Create a repository and upload all files to the root (unzip first).
2. Settings > Pages > Deploy from a branch > `main` and `/ (root)`.
3. Live at `https://<username>.github.io/<repo>/`.

## Editing the site
1. Open `/admin.html`. Edit any text, add or remove sections, templates, steps and FAQs.
2. Click **Preview draft** to see changes before they go live.
3. Click **Publish to GitHub** (needs a fine-grained token with Contents: Read and write on this repo only), or **Download content.json** and upload it to the repo yourself.

Anyone can open `admin.html`, but nobody can change the live site without your GitHub token.

## Products, images and prices
Each section can list products or services with a name, description, price and photo. Leave the price empty to show "Ask for a quote". Each product has an Order / Quote button that opens WhatsApp with the product name filled in.

To add a photo, open `admin.html`, choose a photo on the product and press Upload. It is resized and saved in the `images/` folder of your repository (this uses the GitHub details in the Publish panel). You can also paste an image link instead.

## Admin password
The first time you open `admin.html` you are asked to create a password. Press **Publish to GitHub** afterwards so it takes effect on the live site. This password only locks the page for casual visitors. Your real protection is the GitHub token, since nobody can change the live site without it.

## Templates are preview-only
Each section can hold templates. Visitors see a short watermarked preview and a Request button (WhatsApp or email). They cannot download anything from the site, and you send the full file yourself.

Important:
- Never put the real template files (.docx, .pdf, etc.) in this repository. A public repo means anyone can download them. Keep them on your phone or computer and send them on request.
- Only put a small sample in the preview. The site blocks copy, right-click and print, but nothing can stop a screenshot, so a short sample is the real protection.

## Order form
The form is hosted by n8n. The workflow must be **Active** and use the production URL (`/form/...`).
