# Google Play Data Safety Form Answers

Copy these answers exactly when filling out the "Data Safety" section in the Google Play Console.

## 1. Data Collection & Security

*   **Does your app collect or share any of the required user data types?** -> **Yes**
*   **Is all the user data collected by your app encrypted in transit?** -> **Yes** (Firebase uses HTTPS/TLS)
*   **Do you provide a way for users to request that their data be deleted?** -> **Yes** (Account deletion feature is present)

## 2. Data Types

### Category: Personal Info
*   **Name**
    *   **Collected?**: Yes
    *   **Shared?**: No
    *   **Purpose**: App functionality (Account management, Invoice headers)
*   **Email Address**
    *   **Collected?**: Yes
    *   **Shared?**: No
    *   **Purpose**: App functionality (Login/Auth, Account recovery)
*   **User IDs**
    *   **Collected?**: Yes
    *   **Shared?**: No
    *   **Purpose**: App functionality (Firebase Auth UID to link data)

### Category: Financial Info
*(Only select "Yes" if you process payments OR store financial records. Since this is an accounting app, you store records.)*
*   **User Payment Info** (e.g., Credit card number)
    *   **Collected?**: No (Unless you process cards directly. If using Razorpay SDK, check their guide. Usually "No" if it hands off to a browser/UPI app).
*   **Purchase History**
    *   **Collected?**: Yes (If you track App Subscription history)
    *   **Shared?**: No
    *   **Purpose**: App functionality

### Category: Photos and Videos
*   **Photos**
    *   **Collected?**: Yes
    *   **Shared?**: No
    *   **Purpose**: App functionality (Product images, Profile pics)

### Category: Contacts
*   **Contacts**
    *   **Collected?**: **No** (Based on removal of permission. If you *do* have a contact picker that uploads the contact list, this must be YES. If you only pick one contact locally, it's usually NO, but Google is strict. Safest: NO, and ensure code doesn't bulk upload contacts).

### Category: App Activity
*   **App interactions**
    *   **Collected?**: Yes
    *   **Shared?**: No
    *   **Purpose**: Analytics (Firebase Analytics)

### Category: Device or other IDs
*   **Device or other IDs**
    *   **Collected?**: Yes
    *   **Shared?**: Yes (Firebase Analytics/Crashlytics often shares anonymous IDs for stability)
    *   **Purpose**: Analytics, Fraud prevention, App functionality

## 3. Data Usage & Handling
*   **Is this data collected, shared, or both?** -> **Collected** (mostly).
*   **Is this data processed ephemerally?** -> **No** (It is stored).
*   **Is this data required for your app, or can users choose whether to collect it?** -> **Required** (Login is required).

## Summary Statement
"The application collects basic user profile information (Name, Email) for account management and authentication. It stores user-generated business records (Invoices, Ledger entries) which are encrypted and stored securely on cloud servers. Images uploaded by users (Logo, Products) are also stored. No personal data is sold to third parties."
