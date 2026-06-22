# Intake App

A dependency-free static intake workflow app for capturing, triaging, and routing requests.

## Run

Open `index.html` in a browser, or start the local app server from PowerShell:

```powershell
.\start-demo.ps1
```

Then open:

- Kiosk: `http://127.0.0.1:4173/`
- Admin: `http://127.0.0.1:4173/admin.html`

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

Vercel will serve the HTML, CSS, and JavaScript files as a static site.

After deployment, the main routes are:

- Kiosk: `/`
- Admin: `/admin`

The admin route is currently a static route, not an authenticated internal app. Add authentication and a backend database before using it for sensitive or production intake data.

## App Flow

1. Submit a request from the kiosk screen.
2. Open the admin screen.
3. Select an intake to show the detail panel.
4. Advance status to show triage movement.
5. Archive a request or reset the sample queue.
