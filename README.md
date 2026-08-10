# TopCoat Blueprint Analyzer

AI-powered blueprint analyzer for TopCoat Tech field crews.

---

## Deploy in 5 steps (takes about 10 minutes, all free)

### What you'll need
- A free GitHub account → github.com
- A free Vercel account → vercel.com  
- Your Anthropic API key → console.anthropic.com

---

### Step 1 — Create a GitHub repository

1. Go to **github.com** and sign in
2. Click the **+** button (top right) → **New repository**
3. Name it: `topcoat-blueprint`
4. Leave everything else as default → click **Create repository**

---

### Step 2 — Upload the project files

On your GitHub repo page:

1. Click **uploading an existing file** (link near the middle of the page)
2. Drag the entire `topcoat-blueprint` folder contents into the upload area
   - Upload everything: `src/`, `api/`, `public/`, `package.json`, `vite.config.js`, `index.html`, `vercel.json`, `.gitignore`
3. Click **Commit changes**

---

### Step 3 — Connect to Vercel

1. Go to **vercel.com** and sign in (use "Continue with GitHub")
2. Click **Add New → Project**
3. Find your `topcoat-blueprint` repo and click **Import**
4. Vercel auto-detects it as a Vite project — leave all settings as-is
5. Click **Deploy** — wait about 60 seconds

---

### Step 4 — Add your Anthropic API key

1. In Vercel, go to your project → **Settings → Environment Variables**
2. Click **Add**
   - Name: `ANTHROPIC_API_KEY`
   - Value: your API key (starts with `sk-ant-...`)
3. Click **Save**
4. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**

---

### Step 5 — Share the URL with your crew

Vercel gives you a URL like:  
`https://topcoat-blueprint.vercel.app`

Share that link with your guys. They can:
- Open it on any iPhone or Android browser
- Tap **Take a Photo** to snap a blueprint on the spot
- Or upload an existing photo from their camera roll
- Get instant AI room measurements and square footage

**Tip:** Tell them to tap "Add to Home Screen" in their browser — it'll look and work like a real app icon.

---

## Getting your Anthropic API key

1. Go to **console.anthropic.com**
2. Sign in or create a free account
3. Click **API Keys** in the left menu
4. Click **Create Key** → copy it
5. Add it to Vercel as shown in Step 4

API usage costs about $0.01–0.03 per blueprint analyzed.

---

## Questions?
Built by Claude for TopCoat Tech.
