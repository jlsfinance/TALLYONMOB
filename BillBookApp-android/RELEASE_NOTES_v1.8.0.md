# Release Notes - Version 1.8.0

## 📱 What's New

### Ledger Report Improvements
Fixed critical issues in customer ledger reports to ensure accurate financial statements.

### Key Fixes:

✅ **Accurate Company/Customer Names**
- Ledger reports now display correct customer or company names
- No more "ABC" or blank headers

✅ **Correct Closing Balance Calculation**  
- Fixed calculation to match the selected date range
- Balance now accurately reflects: Total Pending Invoices - Total Payments

✅ **Fixed Payment QR Codes**
- QR codes now contain the exact outstanding amount
- Customers can scan and pay the correct balance

✅ **Visual PAID Invoice Indicators**
- PAID bills shown with green ✓ checkmark
- Clear distinction between pending and settled invoices
- PAID invoices excluded from outstanding balance

### Technical Improvements:
- Optimized build process
- Fixed Gradle memory issues
- Improved stability

---

## 🇮🇳 हिंदी में (for Google Play Store - Hindi)

### नया क्या है

**लेजर रिपोर्ट में सुधार**

✅ सही ग्राहक/कंपनी का नाम दिखेगा
✅ शेष राशि की सटीक गणना
✅ QR कोड में सही बकाया राशि
✅ भुगतान किए गए बिलों पर हरा ✓ निशान

**खाता विवरण अब बिल्कुल सही!**

---

## 📝 For Google Play Console

### What's new (English - 500 char limit):

Bug fixes for ledger reports:
• Fixed customer name display (no more "ABC")
• Accurate closing balance calculation from transactions
• Correct payment QR codes with exact amount
• Visual indicators for PAID invoices (green checkmark)
• Improved calculation logic excludes paid bills from outstanding balance

Performance improvements and build optimizations.

---

### नया क्या है (Hindi - 500 char limit):

लेजर रिपोर्ट में सुधार:
• ग्राहक का सही नाम दिखेगा
• शेष राशि की सटीक गणना
• QR कोड में सही बकाया राशि
• भुगतान किए गए बिलों पर हरा ✓ चिन्ह
• बकाया राशि की गणना में सुधार

प्रदर्शन में सुधार और बग फिक्स।

---

## 📊 Version History

- **v1.8.0** (Current) - Ledger report fixes
- **v1.7.0** - Previous stable release

---

## 🔐 Build Information

- **Version Name**: 1.8.0
- **Version Code**: 10
- **Build Date**: 2026-01-05
- **Release Type**: Stable
- **Target SDK**: Android 14 (API 34)
- **Min SDK**: Android 6.0 (API 23)

---

## 📦 Files Generated

✅ **app-release.aab** - For Google Play Store upload
✅ **app-release.apk** - For direct installation/testing

Both files are signed and ready for distribution.
