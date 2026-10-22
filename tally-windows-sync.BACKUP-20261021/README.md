# 🖥️ LiveKeeping Windows Sync App

A robust, production-grade desktop application to sync Tally ERP data with the LiveKeeping Cloud.

## ✨ Features
- **Auto-Sync**: Automatically syncs ledgers, vouchers, and stock every 5 minutes.
- **Incremental Sync**: Only uploads changed data to save bandwidth.
- **Offline Safety**: Queues data in SQLite if internet fails and retries later.
- **Real-time Dashboard**: View sync status, logs, and connection health.
- **Secure**: Uses API Key authentication and secure HTTPS channel.

## 🛠️ Prerequisites
- **Windows 10/11** or Windows Server 2016+
- **.NET 8 Runtime** installed.
- **Tally ERP 9** or **Tally Prime** running on the same machine (or accessible network).
- **Tally ODBC Server** must be enabled on port 9000 (Default).

## 🚀 Setup Guide

### 1. Configure Tally
1. Open Tally Prime / ERP 9.
2. Go to **F12: Configure** > **Advanced Configuration**.
3. Set **Enable ODBC Server** to `Yes`.
4. Set **Port** to `9000`.
5. Restart Tally.

### 2. Build & Run
1. Open the solution in **Visual Studio 2022**.
2. Restore NuGet packages.
3. Build the project in `Release` mode.
4. Run `TallySyncApp.exe`.

### 3. App Configuration
1. Go to the **Settings** tab.
2. **API Endpoint**: Enter your deployed backend URL (e.g., `https://api.myapp.com/api/v1`).
3. **API Key**: Enter the company-specific Sync API Key generated from the admin panel.
4. Click **Test Connection**.
5. Click **Save Settings**.
6. Switch to **Dashboard** and click **Start Auto-Sync**.

## 📂 Project Structure
- **Models**: Maps Tally XML data to C# Objects.
- **Services**:
  - `TallyConnector.cs`: Communicates with Tally ODBC.
  - `ApiClient.cs`: Uploads data to Cloud.
  - `OfflineQueueService.cs`: Manages SQLite request queue.
  - `SyncManager.cs`: Main orchestration logic.
- **ViewModels**: Connects UI to Business Logic.
- **Views**: WPF XAML UI.

## ⚠️ Common Issues
- **"Tally not connected"**: Ensure Tally is open and the Company is active (not stuck on "Select Company" screen).
- **"Server Error"**: Check your internet and API Key.
- **Port Conflict**: If port 9000 is used, change it in Tally and the App Settings.

---
Built with ❤️ for LiveKeeping
