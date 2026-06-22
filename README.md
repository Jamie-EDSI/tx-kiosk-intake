# Intake App

A dependency-free static intake workflow app for capturing, triaging, and routing requests.

## Run

Open `index.html` in a browser, or start the local app server from PowerShell:

```powershell
.\start-demo.ps1
```

Then open `http://127.0.0.1:4173/`.

The app stores demo records in `localStorage`, and the Reset button restores the sample queue.

If you see a directory listing of your home folder, the server was started from the wrong directory. Stop it with `Ctrl+C`, open PowerShell in this folder, and run `.\start-demo.ps1`.

## Deploy To Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose Add New Project.
3. Import the GitHub repository.
4. Leave Framework Preset as Other.
5. Leave Build Command empty.
6. Leave Output Directory empty.
7. Deploy.

Vercel will serve `index.html`, `styles.css`, and `app.js` as a static site.

## App Flow

1. Start with the queue metrics and sample requests.
2. Select an intake to show the detail panel.
3. Add a new request from the form.
4. Advance status to show triage movement.
5. Archive a request or reset the demo.
