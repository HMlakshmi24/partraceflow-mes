# How to Run ParTraceflow MES

## Prerequisites
- **Node.js** (Installed)
- **Terminal** (PowerShell, Command Prompt, or VS Code Terminal)

## Quick Start Commands

### 1. Start the Application (Development Mode)
This is the standard way to run the app while making changes.

```powershell
cd f:\MES\mes-app
npm run dev
```

**Result**: The app will be available at [http://localhost:3000](http://localhost:3000).

---

### 2. Build for Production (Optimization)
If you want to check for errors and optimize the app (make it faster):

```powershell
cd f:\MES\mes-app
npm run build
npm start
```

---

### 3. Troubleshooting
**"Port 3000 is already in use"**
If you see this error, it means the app is already running in another window.
- **Solution**: Find the other terminal and close it (Ctrl+C), or just go to the URL directly.
