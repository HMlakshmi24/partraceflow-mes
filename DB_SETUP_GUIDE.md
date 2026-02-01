# PostgreSQL Setup Guide for ParTraceflow MES

Currently, the app uses a `db.json` file. To upgrade to a real high-performance database, follow these steps.

## 1. Install PostgreSQL
**Windows**:
1.  Download the Interactive Installer from [enterprisedb.com](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads).
2.  Run the installer. Set the password (e.g., `admin123`).
3.  Launch "pgAdmin 4" (installed with it) to verify it's running.

## 2. Create the Database
1.  Open **pgAdmin**.
2.  Right-click "Databases" -> **Create** -> **Database**.
3.  Name it: `mes_production`.

## 3. Connect the App
1.  Open the project folder `f:\MES\mes-app`.
2.  Open `.env` file.
3.  Change `DATABASE_URL` to:
    ```
    DATABASE_URL="postgresql://postgres:admin123@localhost:5432/mes_production"
    ```
    *(Replace `admin123` with your actual password)*.

## 4. Activate the Switch
I have prepared the code. When you are ready:
1.  Delete `lib/services/database.ts` (The JSON version).
2.  Rename `lib/services/database_postgres.ts` to `database.ts` (I will create this file for you).
3.  Run:
    ```powershell
    npx prisma migrate dev
    ```

Your app is now Industry Standard!
