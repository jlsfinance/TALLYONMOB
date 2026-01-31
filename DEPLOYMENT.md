# 🚀 Tally Sync System - Deployment Guide

This guide details how to deploy the entire Tally Sync ecosystem (Backend, Windows App, and Mobile App) to production.

---

## 1. ☁️ Backend Deployment (Node.js + Supabase)

### A. Database (Supabase)
1. **Create Project**: Log in to [Supabase](https://supabase.com) and create a new project.
2. **Execute Schema**:
   - Go to **SQL Editor**.
   - Copy content from `tally-sync-backend/supabase_schema_complete.sql`.
   - Run the script to create tables, indexes, and RLS policies.
3. **Get Credentials**:
   - Go to **Project Settings** > **API**.
   - Copy `Project URL` and `service_role` (secret) key.

### B. App Server (Render / Heroku / DigitalOcean)
We recommend **Render.com** for ease of use.
1. **Push Code**: Push `tally-sync-backend` to GitHub/GitLab.
2. **Create Web Service**: Connect your repo to Render.
3. **Environment Variables**:
   Add the following variables in Render Dashboard:
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (or leave default)
   - `SUPABASE_URL`: `your_supabase_project_url`
   - `SUPABASE_SERVICE_ROLE_KEY`: `your_service_role_key`
   - `SYNC_API_KEY`: `generate_a_strong_random_string`
   - `ALLOWED_ORIGINS`: `*` (or specific domains)
4. **Deploy**: Click "Manual Deploy".
5. **Copy URL**: Note your backend URL (e.g., `https://tally-sync-api.onrender.com`).

---

## 2. 🖥️ Windows Sync App Deployment

### A. Configuration
1. Open `tally-windows-sync/appsettings.json`.
2. Update `SyncSettings`:
   ```json
   "ApiBaseUrl": "https://tally-sync-api.onrender.com/api/v1",
   "ApiKey": "the_strong_string_you_generated"
   ```

### B. Build & Distribute
1. Open solution in **Visual Studio 2022**.
2. Select **Release** configuration.
3. Right-click Project > **Publish**.
4. Choose **Folder** target.
5. Publish to a local folder (e.g., `bin/Publish`).
6. **Installer**: Use **Inno Setup** or **NSIS** to create an `.exe` installer that bundles the published files.
   - *Tip*: Ensure the installer checks for .NET 8 Runtime.

---

## 3. 📱 Mobile App Deployment (Android)

### A. Configuration
1. Open `tally_mobile_app/lib/services/api_service.dart`.
2. Update `baseUrl`:
   ```dart
   static const String baseUrl = 'https://tally-sync-api.onrender.com/api/v1/data';
   ```

### B. Build APK/AAB
1. **Generate Keystore**:
   ```bash
   keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias tally-app
   ```
2. **Configure Signing**: Create `android/key.properties` with keystore details.
3. **Build Command**:
   ```bash
   flutter build apk --release
   # OR for Play Store
   flutter build appbundle --release
   ```

---

## 4. 🔄 Verification Checklist

1. **Verify Backend**:
   - Visit `https://your-api.com/health` -> Should return `200 OK`.
2. **Verify Windows App**:
   - Install on a PC with Tally.
   - Ensure "Server Connected" status is Green.
   - Run "Start Sync" and check logs.
3. **Verify Data**:
   - Check Supabase Table Editor (`ledgers`, `vouchers`) to see if data appears.
4. **Verify Mobile App**:
   - Log in and check if the dashboard shows numbers matching Tally.

---

## 🛡️ Security Best Practices for Production
- **Rotate Keys**: Change `SYNC_API_KEY` periodically.
- **Enable RLS**: Ensure Row Level Security is active in Supabase (already in schema).
- **HTTPS Only**: Never deploy without SSL (Render/Supabase handle this automatically).
- **Least Privilege**: The Windows App only needs `INSERT/UPDATE` permission (handled via API logic).

**Happy Syncing!** 🚀
