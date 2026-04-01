# ParTraceflow MES - The Complete Handbook (Version 1.0)

Welcome to the **ParTraceflow Manufacturing Execution System (MES)**. This manual is designed to be the single source of truth for everything about this software—from how to run it, to what technologies it uses, to step-by-step guides for every role in the factory.

---

## 📚 Table of Contents

1.  [Quick Start: How to Run the System](#1-quick-start-how-to-run-the-system)
2.  [Technical Architecture: Under the Hood](#2-technical-architecture-under-the-hood)
3.  [Role-Based User Manuals](#3-role-based-user-manuals-how-to-work-in-mes)
    *   [The Production Manager (Planner)](#31-the-production-manager-planner)
    *   [The Machine Operator (Shop Floor)](#32-the-machine-operator-shop-floor)
    *   [The Quality Inspector (QC)](#33-the-quality-inspector-qc)
4.  [Understanding the Dashboard Metrics](#4-understanding-the-dashboard-metrics)
5.  [Troubleshooting & FAQ](#5-troubleshooting--faq)

---

## 1. Quick Start: How to Run the System

Follow these steps to turn on the MES software.

### Prerequisites
*   You must have **Node.js** installed on your computer.

### Starting the Application
1.  **Open the Terminal**: Go to the folder `f:\MES\mes-app`, right-click in the empty space, and select "Open in Terminal".
2.  **Type the Command**:
    ```powershell
    npm run dev
    ```
3.  **Wait for "Ready"**: You will see text scrolling. Wait until it stops and says `Ready in [time]`.
4.  **Open Your Browser**: Go to [http://localhost:3000](http://localhost:3000).

### Stopping the Application
*   Click inside the terminal window and press `Ctrl + C` on your keyboard to stop the server.

---

## 2. Technical Architecture: Under the Hood

This section explains the modern technology stack used to build this high-performance MES.

### **Frontend (The User Interface)**
The part of the software you see and click on is built with industry-leading web technologies.

*   **React 19 (The Core Engine)**:
    *   **What it is**: A JavaScript library for building user interfaces.
    *   **Why we use it**: It allows us to build "Components" (like a button or a chart) once and reuse them everywhere. It makes the app feel instant and snappy because it updates only the parts of the screen that change, rather than reloading the whole page.
*   **Next.js 16.1 (The Framework)**:
    *   **What it is**: A framework built on top of React.
    *   **Why we use it**: It handles the "heavy lifting" like routing (moving between pages), server-side rendering (making pages load fast), and API handling. It's the standard for enterprise-grade React apps.
*   **TypeScript (The Language)**:
    *   **What it is**: A stricter version of JavaScript that adds "types".
    *   **Why we use it**: It prevents bugs before they happen. For example, if a function expects a "Number" but we accidentally send "Text", TypeScript stops us from writing that code. This ensures the MES is reliable and crash-proof.
*   **CSS Modules (The Styling)**:
    *   **What it is**: A way to write CSS that is scoped locally to each component.
    *   **Why we use it**: It prevents style conflicts. Changing the "Button" color on the Dashboard won't accidentally break the "Button" on the Settings page. We use detailed, custom CSS variables for a consistent "Dark Mode" industrial theme.
*   **Lucide React (The Icons)**:
    *   **What it is**: A library of clean, consistent vector icons.
    *   **Why we use it**: For clear visual communication (e.g., a "Hard Hat" icon for Operators, a "Clipboard" for Quality).
*   **Recharts (The Charts)**:
    *   **What it is**: A composable charting library built on React components.
    *   **Why we use it**: To visualize OEE, production speeds, and fault timelines elegantly on the Dashboard.

### **Backend (The Logic & Data)**
The invisible part that processes data and saves it.

*   **Next.js API Routes**: We don't need a separate backend server. Next.js handles our API requests (like "Save Order" or "Get Machine Status") seamlessly within the same project.
*   **Prisma (The Database Connector)**:
    *   **What it is**: An ORM (Object-Relational Mapper).
    *   **Why we use it**: It lets us talk to the database using clean TypeScript code instead of writing raw SQL queries. It automatically manages the structure of our data.
*   **Better-SQLite3 (The Database)**:
    *   **What it is**: A blazing-fast, serverless SQL database engine.
    *   **Why we use it**: For this localized version, it stores all data in a single file (`dev.db`). It is incredibly fast and requires zero configuration. For larger factories, this can be easily swapped for PostgreSQL.
*   **Zod (The Validator)**:
    *   **What it is**: A schema declaration and validation library.
    *   **Why we use it**: It checks every piece of data coming in or out. If a user tries to enter a "Quantity" of "-50", Zod catches it and throws an error before it reaches the database.

### **Hardware Integration (The Connection)**
*   **Simulation Mode**: Currently, the system runs "Dummies" (simulated machines) that generate random data for demonstration.
*   **Real Connection**: The architecture supports **Modbus TCP** and **OPC UA** drivers (via Node.js libraries) to connect to real PLCs (Siemens, Allen-Bradley) by modifying the `components/PLCConnection.tsx` file.

---

## 3. Role-Based User Manuals: How to Work in MES

The MES is divided into specific views for different roles in the factory. Here is how to use each one with examples.

### 3.1 The Production Manager (Planner)
**Who**: You, the Manager.
**Goal**: Tell the factory what to make.
**URL**: `/planner`

**Example Workflow: Releasing a New Order**
1.  **Navigate**: Click "Production Planner" in the sidebar.
2.  **Fill the Form**: Look at the "Release New Work Order" section.
    *   **Order Number**: It auto-generates a number (e.g., `WO-9921`), but you can change it to match your ERP.
    *   **Product**: Select `Titanium Bracket` from the dropdown.
    *   **Quantity**: Enter `500`.
3.  **Action**: Click the **"Release to Shop Floor"** button.
4.  **Verify**: Look at the "Production History" table on the right. You will see your new order `WO-9921` appear with the status **"RELEASED"**.
    *   *Result*: This order is now visible to the Operators on the shop floor.

---

### 3.2 The Machine Operator (Shop Floor)
**Who**: The worker standing at the machine.
**Goal**: Execute the work and report issues.
**URL**: `/operator`

**Example Workflow: Running a Job**
1.  **Login**: In a real factory, they would log in. Here, they go straight to the Operator screen.
2.  **View Task**: they see the "Current Job" card. It says:
    *   *Order*: `WO-9921` (The one you just released).
    *   *Target*: `500 Units`.
3.  **Start Job**: They click the big green **"START JOB"** button.
    *   *System Action*: The machine status changes to "RUNNING". The "Good Parts" counter starts counting up as the machine runs (simulated).
4.  **Handle Issues**: If the machine stops, the Operator can click **"REPORT FAULT"**.
    *   *System Action*: The Dashboard alerts the manager, and the OEE score drops until they click "RESOLVE".
5.  **Finish**: When 500 parts are done, they click **"COMPLETE ORDER"**.

---

### 3.3 The Quality Inspector (QC)
**Who**: The QA team checking the final parts.
**Goal**: Ensure no bad parts leave the factory.
**URL**: `/quality`

**Example Workflow: Inspecting a Part**
1.  **Navigate**: Go to the "Quality Control" page.
2.  **Check Context**: See the "Current Work Order" at the top right to know what you are testing.
3.  **Step 1: Visual Check**:
    *   Inspect the part. Is the surface smooth? Check the `Surface finish` box.
    *   Is the color correct? Check the `Color match` box.
4.  **Step 2: Measurements**:
    *   Measure the diameter with calipers. Enter `25.01` in the "Diameter (mm)" box.
    *   Weigh the part. Enter `142` in the "Weight (g)" box.
5.  **Step 3: Final Decision**:
    *   If everything is good, click the big green **"PASS"** button.
    *   If it's bad, click **"SCRAP"** or **"REWORK"**.
6.  **Submit**: Click **"Submit Inspection"**. The system records this result permanently in the database.

---

## 4. Understanding the Dashboard Metrics

The **Dashboard** (`/dashboard`) is the heartbeat of your factory. It updates in real-time.

### The Big 4 Metrics (OEE)
1.  **Availability (%)**:
    *   *Formula*: `Run Time / Planned Production Time`
    *   *Meaning*: Is the machine actually running, or is it stopped? If this is low, your machine is broken or idle too often.
2.  **Performance (%)**:
    *   *Formula*: `(Total Count / Run Time) / Ideal Run Rate`
    *   *Meaning*: Is the machine running at full speed? If this is 50%, the machine is running at half the speed it should be.
3.  **Quality (%)**:
    *   *Formula*: `Good Count / Total Count`
    *   *Meaning*: Are we making good parts? If this is 90%, then 10% of your parts are scrap/trash.
4.  **OEE Score**:
    *   *Formula*: `Availability × Performance × Quality`
    *   *Meaning*: The "Grade" for your factory. World Class is 85%+. Typical is 60%.

---

## 5. Troubleshooting & FAQ

### Q: The charts are empty or look wrong.
**A**: Ensure the backend simulation is running. Check your terminal where you ran `npm run dev`. If it's stopped, press `Ctrl + C` and run `npm run dev` again.

### Q: I created an order but the Operator doesn't see it.
**A**: Did you click "Release"? Orders in "Draft" status are not visible to Operators. Check the status in the Planner table.

### Q: How do I reset all data?
**A**: If you want to wipe the database and start fresh with dummy data:
1.  Stop the server.
2.  Run: `npx prisma migrate reset`.
3.  Restart the server.

---

*This manual was generated for ParTraceflow MES. For technical support, contact the IT department.*
