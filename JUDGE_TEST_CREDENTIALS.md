# Test App Credentials for Judges

Use the details below to access and test **Startup Copilot** (Founder's Flight Deck).

---

## App URL

**Live app:** [INSERT YOUR DEPLOYED FRONTEND URL HERE]  
Example: `https://startup-copilot.vercel.app`

*(Replace with your actual Vercel — or other — frontend URL before submitting.)*

---

## How to sign in (mock login — no password)

The app uses a **mock login**; there is no real authentication or account system.

1. Open the **App URL** above.
2. On the first screen:
   - **Founder name:** Enter any name (e.g. `Judge` or `Demo User`). This is required.
   - **Company / venture:** Optional (e.g. `Startup Copilot Demo`).
3. Click **"Enter the trench"**.

You will be taken to the **Onboarding** step.

---

## Onboarding (document upload)

1. **Upload a document:** Use the drag-and-drop zone or click to choose a file.  
   - Accepted: **PDF, DOCX, TXT, or MD** (e.g. a one-pager, pitch summary, or any short document).
   - The app uses this to extract venture context (problem, solution, market) for the rest of the flow.

After upload, you are taken to **Mission Control**.

---

## What to test

From **Mission Control** you can try:

| Feature | What it does |
|--------|----------------|
| **Market Intelligence** | Run market research; ask follow-up questions. Uses Nova + optional web search. |
| **VC Scout** | Discover and match VCs; optional Nova Act for draft emails. |
| **Asset Forge** | Generate pitch deck (and optionally pitch reel). Uses Nova Pro, Canvas, Reel. |
| **Code Lab** | Add build steps, generate code scaffold, edit with chat, generate images. Uses Nova Pro and Canvas. |
| **Virtual Tank** | Live pitch practice with 3 AI sharks (Nova 2 Sonic + Polly). Use mic or text. |
| **Finance Auditor** | Get a finance critique. Uses Nova 2 Lite. |

**Suggested quick path:**  
Login → Onboarding (upload any PDF or skip) → Mission Control → **Virtual Tank** (“Let’s pitch”) for the voice demo, and **Asset Forge** or **Market Intelligence** for other Nova features.

---

## Technical notes (for judges)

- **Backend:** The frontend talks to a deployed FastAPI backend (e.g. on Render). No separate login is needed for the API; the app handles it.
- **Browser:** Use a modern browser (Chrome, Firefox, Safari, Edge). For **Virtual Tank** (voice), allow microphone access when prompted.
- **First load:** If the backend is on a free tier that spins down after inactivity, the first request after idle may take 30–60 seconds; subsequent requests are fast.

---

## Contact

If you cannot access the app or hit errors, please note the URL you used, the step (login / onboarding / mission control / feature name), and any on-screen error or behavior and include it in your evaluation or contact the team.
