# 🚀 Google Play Store Submission Guide - JLS BillBook

This document contains **exact answers** and **texts** you need to copy-paste into the Google Play Console to ensure a smooth review process.

---

## 1️⃣ App Content - Data Safety Form

**Does your app collect or share any of the required user data types?**  
👉 **Yes**

**Is all of the user data collected by your app encrypted in transit?**  
👉 **Yes**

**Do you provide a way for users to request that their data be deleted?**  
👉 **Yes**

### 📂 Data Types to Select:

#### A. Personal Info
| Data Type | Collected | Shared | Purpose |
| :--- | :--- | :--- | :--- |
| **Name** | Yes | No | App functionality, Account management |
| **Email Address** | Yes | No | App functionality, Account management |
| **Phone Number** | Yes | No | App functionality, Account management |
| **Address** | Yes | No | App functionality (Business Address on Invoice) |

#### B. Financial Info
| Data Type | Collected | Shared | Purpose |
| :--- | :--- | :--- | :--- |
| **Purchase History** | Yes | No | App functionality (User's invoice history) |
| **Other Financial Info** | Yes | No | App functionality (Transactions/Ledger entries) |

> **Note:** Select "App Functionality" as the purpose. Explicitly note that this is **User-Generated Content** (invoices they create).

#### C. Contacts
| Data Type | Collected | Shared | Purpose |
| :--- | :--- | :--- | :--- |
| **Contacts** | Yes | No | App functionality |

> **IMPORTANT:** When asked "Is this data processed ephemerally?", select **YES**.
> *Why?* Because you only read contacts locally to autofill; you do NOT upload them to your server.

---

## 2️⃣ Store Listing - Full Description (Critical First Paragraph)

Paste this at the **very top** of your Full Description to avoid "Misleading Claims" rejection:

> **DISCLAIMER: NOT A LOAN APP**
> JLS BillBook is a professional billing, invoicing, and accounting tool (Khata Book) for small businesses. We are **NOT** a bank, NBFC, or lender. We do **NOT** provide loans, credit, or financial services of any kind. All data stored in this app is user-entered for record-keeping purposes only.

---

## 3️⃣ Login Credentials for Reviewers

You **MUST** provide a test account. Do not make them sign up.

*   **Username / Email:** `review@jlsbillbook.com` (or any dummy email you create)
*   **Password:** `Test@1234`
*   **Notes:** "Please use these credentials to access the full features of the app without needing OTP verification."

---

## 4️⃣ Notes for Reviewer (Copy-Paste)

Paste this in the **"Notes for the Reviewer"** section (under App Content > App Access):

```text
Dear Review/Compliance Team,

This application ("JLS BillBook") is a productivity tool designed for small business owners in India to generate invoices ("Bills") and manage their daily ledgers.

COMPLIANCE CLARIFICATIONS:

1. NOT A LOAN APP:
   - We do not offer personal loans or financial products.
   - We are not associated with any NBFCs.
   - Any reference to "Credit" or "Balance" refers strictly to "Shop Credit" (Udhar) given by a shopkeeper to their customer, recorded manually by the user.

2. PERMISSIONS & DATA:
   - We request minimal permissions.
   - "Read Contacts" is optional and used ONLY to autofill customer names during invoice creation. Data is processed locally and never uploaded.
   - A dedicated "Privacy Disclosure" screen is shown on first launch (see attached screenshot or launch app).

3. ACCOUNT DELETION:
   - Users can delete their account and all data instantly via Settings > Danger Zone > Delete Account.

We have ensured strict adherence to the Financial Services Policy.

Thank you.
```

---

## 5️⃣ Privacy Policy URL

Ensure this URL is active and reachable:
`https://sites.google.com/view/jls-billbook-privacy` (Or the link you created using the HTML file provided).

---
**✅ Checklist Before Clicking "Submit":**
1. [ ] Privacy Policy Link is working.
2. [ ] Test Account credentials are provided.
3. [ ] "Not a Loan App" disclaimer is in the Store Listing.
4. [ ] Data Safety Form matches the table above.
