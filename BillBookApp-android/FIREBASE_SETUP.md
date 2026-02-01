# Firebase Security Rules Setup

## Error Resolution: "The application cannot access the database"

This error occurs when Firestore Security Rules are missing or incorrect.

### ACTION REQUIRED: UPDATE FIREBASE RULES

Follow these steps to fix the issue:

### Step 1: Go to Firebase Console

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Rules** tab

### Step 2: Replace Existing Rules

Copy the rules from `firestore.rules` file in this directory and paste them in the Firebase Console.

**Or copy directly from here:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Allow user to read/write their own company profile
    match /companies/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow user to read/write their own data in 'users' collection
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // New: Allow users to access all companies they own
    match /companies/{companyId} {
      allow read, write: if request.auth != null && 
                            request.auth.uid == resource.data.owner_uid;
      allow create: if request.auth != null && 
                      request.auth.uid == request.resource.data.owner_uid;
    }
  }
}
```

### Step 3: Click "Publish"

After pasting the rules, click the **Publish** button.

### What These Rules Do:

1. **User-specific company access**: Users can only read/write companies they own (`owner_uid` matches their `auth.uid`)
2. **Multi-company support**: Users can create and manage multiple companies
3. **Security**: Other users cannot access your company data

### Testing:

After updating rules:
1. Refresh your app at `localhost:5003/bill`
2. The error should disappear
3. You should be able to:
   - View your company profile
   - Create new companies
   - Switch between companies

---

## Additional Firebase Setup (if needed)

### Enable Authentication:

1. Go to Firebase Console → **Authentication**
2. Click **Get Started**
3. Enable **Email/Password** provider

### Create Firestore Database:

1. Go to Firebase Console → **Firestore Database**
2. Click **Create Database**
3. Choose **Start in Test Mode** (we'll secure it with rules above)
4. Select your preferred location

---

## Common Issues:

**Issue**: "Permission denied" after login
**Solution**: Make sure you published the rules (Step 3)

**Issue**: Can't create new company
**Solution**: Verify `owner_uid` field is being saved correctly in company creation

**Issue**: Rules showing syntax error
**Solution**: Copy-paste the entire rules block exactly as shown above

---

## Google Login Setup (Android)

If Google Login is failing on Android, follow these critical steps:

### 1. Register Android SHA-1 Fingerprint
1. Go to **Firebase Console** → **Project Settings** → **General**.
2. Scroll to **Your Apps** → **Android App** (`com.jls.billbook`).
3. Click **Add Fingerprint**.
4. You need to add the SHA-1 fingerprint of your signing key (the one in `release-key.keystore`).
5. Also, add the SHA-1 of your debug key if testing in debug mode.

### 2. Verify Client IDs
1. Ensure the **Web Client ID** (client_type 3 in `google-services.json`) is correctly pasted in:
   - `capacitor.config.ts` as `serverClientId`.
   - `strings.xml` as `server_client_id`.
2. Download the latest `google-services.json` after adding the fingerprint and replace the one in `android/app/`.

### 3. Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project.
3. Go to **APIs & Services** → **Credentials**.
4. Verify that you have:
   - An **Android client ID** for `com.jls.billbook`.
   - A **Web client ID** (this is your Server Client ID).

---

For more help, contact: lovneetrathi@gmail.com
