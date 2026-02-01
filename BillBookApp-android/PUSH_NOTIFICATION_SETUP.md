# Push Notification Setup (Vercel + FCM)

## Overview
This setup uses Vercel Serverless Functions to send FCM push notifications. This works on Firebase Spark (Free) plan!

## Setup Steps

### Step 1: Get Firebase Service Account Key
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Project Settings** (gear icon) > **Service Accounts**
4. Click **"Generate new private key"**
5. Download the JSON file

### Step 2: Add Environment Variables to Vercel
Go to your Vercel project dashboard > Settings > Environment Variables

Add these variables (from your downloaded JSON file):

| Variable Name | Value (from JSON) |
|---------------|-------------------|
| `FIREBASE_PROJECT_ID` | `project_id` |
| `FIREBASE_PRIVATE_KEY_ID` | `private_key_id` |
| `FIREBASE_PRIVATE_KEY` | `private_key` (include the entire key with \n) |
| `FIREBASE_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_CLIENT_ID` | `client_id` |
| `FIREBASE_CERT_URL` | `client_x509_cert_url` |

### Step 3: Deploy to Vercel
```bash
git add .
git commit -m "Add push notification API"
git push origin MOBILEAPP
```

Vercel will automatically deploy!

## API Endpoints

### 1. Send to Single Customer
```
POST /api/push/send
Body: {
    "customerId": "customer_firebase_id",
    "title": "Payment Reminder",
    "message": "Your EMI is due tomorrow"
}
```

### 2. Broadcast to All Company Customers
```
POST /api/push/broadcast
Body: {
    "companyId": "company_firebase_id",
    "title": "Holiday Notice",
    "message": "Office closed on Diwali"
}
```

### 3. Direct Token (Testing)
```
POST /api/push/direct
Body: {
    "token": "fcm_device_token",
    "title": "Test",
    "message": "Test notification"
}
```

## How It Works
1. Customer opens app → FCM token is saved to Firestore (`fcm_tokens` collection)
2. Admin sends notification → API fetches token from Firestore
3. Vercel serverless function sends notification via FCM
4. Customer receives notification even if app is closed! 🎉

## Cost: FREE ✅
- FCM is free on all Firebase plans
- Vercel Free tier includes 100GB bandwidth + serverless functions
