# Dashboard Features Setup Guide

## 1. Promo Slides (Firebase Managed)

### Firestore Collection: `promo_slides`

Add documents with the following structure:

```javascript
{
  id: "promo_1",
  title: "AI Bill Scanning Live!",
  subtitle: "Scan any bill and auto-fill items",
  content: "Use JLS AI to scan bills instantly and save time.",
  gradient: "from-blue-600 to-indigo-600",
  type: "FEATURE",  // FEATURE | PROMO | UPDATE | TIP | AD
  isActive: true,
  order: 1,
  createdAt: "2026-01-15T00:00:00.000Z"
}
```

### Sample Promo Slides:

```javascript
// Slide 1 - Feature
{
  id: "promo_1",
  title: "Smart Calculator",
  subtitle: "Quick billing with just numbers",
  gradient: "from-purple-600 to-pink-600",
  type: "FEATURE",
  isActive: true,
  order: 1
}

// Slide 2 - Tip
{
  id: "promo_2", 
  title: "Pro Tip: Swipe to Delete",
  subtitle: "Swipe any bill left to delete quickly",
  gradient: "from-green-500 to-emerald-600",
  type: "TIP",
  isActive: true,
  order: 2
}

// Slide 3 - Update
{
  id: "promo_3",
  title: "GST Reports Ready!",
  subtitle: "Download GSTR-1 ready reports",
  gradient: "from-orange-500 to-red-500",
  type: "UPDATE",
  isActive: true,
  order: 3
}

// Slide 4 - Promo
{
  id: "promo_4",
  title: "Premium Features Coming",
  subtitle: "Multi-branch, Staff login & more",
  gradient: "from-blue-600 to-cyan-500",
  type: "PROMO",
  isActive: true,
  order: 4
}

// Slide 5 - Ad
{
  id: "promo_5",
  title: "Share with Friends!",
  subtitle: "Refer JLS Suite and get rewards",
  gradient: "from-yellow-500 to-orange-500",
  type: "AD",
  isActive: true,
  order: 5
}
```

---

## 2. Payment Reminders (User Data)

### Firestore Collection: `users/{userId}/payment_reminders`

Each user has their own payment reminders stored under their user path.

```javascript
{
  id: "rem_1705350000000",
  customerId: "cust_123",  // Optional - link to customer
  customerName: "Sharma Ji",
  amount: 5000,
  dueDate: "2026-01-15",  // YYYY-MM-DD format
  note: "Said will pay on Sunday",
  invoiceId: "inv_123",  // Optional
  invoiceNumber: "INV-001",  // Optional
  status: "PENDING",  // PENDING | COLLECTED | POSTPONED
  createdAt: "2026-01-12T10:30:00.000Z",
  collectedAt: null  // Set when marked as collected
}
```

---

## Firestore Security Rules

Add these rules to allow promo slides read for all and reminders for authenticated users:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Promo slides - read only for all authenticated users
    match /promo_slides/{slideId} {
      allow read: if request.auth != null;
      allow write: if false; // Admin only via console
    }
    
    // Payment reminders - user's own data
    match /users/{userId}/payment_reminders/{reminderId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## How to Add Promo Slides via Firebase Console

1. Go to Firebase Console → Firestore Database
2. Create collection `promo_slides`
3. Add documents with the structure above
4. Set `isActive: true` to show the slide
5. Use `order` to control slide sequence
6. Use gradients like:
   - `from-blue-600 to-indigo-600` (Blue)
   - `from-green-500 to-emerald-600` (Green)
   - `from-orange-500 to-red-500` (Orange)
   - `from-purple-600 to-pink-600` (Purple)
   - `from-yellow-500 to-orange-500` (Yellow)

---

## Features Summary

### Promo Slides Carousel
- ✅ 5-7 slides auto-rotating every 5 seconds
- ✅ Starts from random slide each app open
- ✅ Firebase managed - update slides without app update
- ✅ Fallback to legacy ads if no Firebase slides

### Payment Reminders (Vasool Karo!)
- ✅ Add reminder with customer name, amount, due date
- ✅ Shows on dashboard when due date = today
- ✅ Mark as "Collected" to complete
- ✅ "Postpone" to move to next day
- ✅ Data stored in Firebase per user
- ✅ Real-time updates via Firestore subscription
