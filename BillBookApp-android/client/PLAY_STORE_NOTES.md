# Google Play Store Compliance & Data Safety Notes

## 1. Authentication & Access
**Does the app use Authentication?**
* **Yes.** The app uses Firebase Authentication (Identity Platform).

**How do users authenticate?**
* **Email/Password (Managed):** Users are provided credentials (Login ID + Password) by their organization administrator. 
* *Note for Reviewer:* The app uses a secure system-managed identity (`<company>_<phone>@customer.app`). Users do not sign up themselves; accounts are provisioned by businesses using the platform.

**Does the app allow users to delete their account?**
* **Yes.** A request for deletion can be made within the app (Account Settings -> Delete Account) or by contacting the administrator.

## 2. Data Collection & Sharing
**Does the app collect Personal Info?**
* **Yes.** Name, Phone Number.
* *Purpose:* Account Management, App Functionality.

**Does the app collect Financial Info?**
* **Yes.** Transaction history, credit/debit records.
* *Purpose:* App Functionality (Core feature: Digital Ledger/Bill Book).

**Is data shared with third parties?**
* **No.** Data is strictly stored in secure Firebase servers and only accessible by the specific business and the customer.

## 3. Security
**Is data encrypted in transit?**
* **Yes.** All traffic uses HTTPS/SSL via Google Firebase infrastructure.

**Is data encrypted at rest?**
* **Yes.** Firebase Firestore handles encryption at rest.

## 4. Specific Policy Compliance
* **Financial Services Policy:** The app is a **Bookkeeping/Ledger Tool**, NOT a lending app. It does not issue loans. "Installments" refer to repayment of credit for goods/services sold, not cash loans.
* **Authentication Policy:** We do NOT use OTPs to minimize costs and reliance on SMS permissions. We use a secure, password-based credential system provisioned by the Admin.
