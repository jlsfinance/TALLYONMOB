# Google Play Compliance Texts

Use these exact texts for your Google Play Console configuration and in-app legal pages.

---

## 1. App Description (Store Listing)

**Short Description (80 chars):**
Professional Bill Book, Invoicing & Business Ledger App for Small Businesses.

**Full Description:**
**IMPORTANT DISCLAIMER: JLS BillBook is a business accounting and record-keeping application. We are NOT a bank, NBFC, or lender. We do not provide loans, credit facilities, or financial aid to users. This app is designed solely for businesses to generate invoices and track their own credit/debit records with customers.**

**JLS BillBook** is the ultimate all-in-one solution for small business owners, freelancers, and shopkeepers to manage their billing and accounting.

**Key Features:**
*   **Smart Invoicing:** Create professional GST and non-GST invoices in seconds.
*   **Digital Ledger:** Replace your traditional Udhar Bahi Khata. Track money given (Credit) and money received (Payment) easily.
*   **Payment Reminders:** Send WhatsApp reminders to customers for pending payments.
*   **Business Reports:** Get automatic Daybook, Sales, and Expense reports.
*   **Data Security:** Your data is 100% secure and synced to the cloud. Only you have access to your business records.

**Data Privacy:**
We respect your privacy. JLS BillBook allows you to delete your account and all associated data at any time from the 'Settings' menu. We do not share your personal business records with third-party advertisers.

---

## 2. In-App Disclosures (Consent Texts)

### A. Camera Permission Disclosure
**When to show:** Before requesting `CAMERA` permission.
**Title:** Camera Access
**Message:**
"JLS BillBook needs access to your camera to allow you to capture photos of invoices, bills, and products, and to scan QR codes for payments. This feature is optional."

### B. Storage/File Permission Disclosure
**When to show:** Before requesting `READ_EXTERNAL_STORAGE` or `WRITE_EXTERNAL_STORAGE` (if < Android 13).
**Title:** Storage Access
**Message:**
"To save invoices as PDF files and share them with your customers, JLS BillBook requires access to your device storage. We only access files created by this app."

### C. WhatsApp Permission (Accessibility/Automation - if used)
**Note:** If you use Accessibility Services for WhatsApp automation, you MUST have a dedicated screen.
**Title:** Automation Service
**Message:**
"This app uses Accessibility Services to help you send automated payment reminders on WhatsApp without typing manually. No personal data is collected or read from your screen using this service."
*(If not using Accessibility for this, ignore this section).*

---

## 3. Privacy Policy (Snippet for "Loan" clarification)

*Add this section to your `PRIVACY_POLICY.md` or website policy:*

**No Lending Services:**
JLS BillBook does not offer personal loans or payday loans. Any references to "Credit" or "Debit" within the application refer strictly to the user's manual entry of trade transaction records (accounts receivable/payable) and do not imply a disbursement of funds by JLS BillBook.

**User Generated Content:**
All financial data, including transaction amounts and customer names, is user-generated. JLS BillBook acts as a data processor and storage provider. We do not verify the authenticity of debts recorded by users.
