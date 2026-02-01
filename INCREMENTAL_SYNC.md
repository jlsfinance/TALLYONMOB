# 🔄 ALTERID-Based Incremental Sync System

## Overview

The Tally Sync app now uses **Tally's ALTERID** for true incremental sync. This means:

- ✅ **Catches ALL modifications** - even changes to 6-month old entries
- ✅ **Efficient syncing** - only fetches what's changed
- ✅ **No missed entries** - regardless of when they were originally created

## How It Works

### Tally's Internal Tracking

Tally internally maintains two IDs for every record:

| Field | Description |
|-------|-------------|
| **MASTERID** | Unique ID that never changes (like a primary key) |
| **ALTERID** | Modification counter - increases on EVERY edit |

### Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCREMENTAL SYNC FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. FIRST SYNC (when Cloud is empty):                          │
│     └→ Fetch ALL historical data (date-based, monthly chunks)  │
│     └→ Store ALTERID for every record                          │
│                                                                 │
│  2. SUBSEQUENT SYNCS (every 15 min / manual):                  │
│     ├→ Get MAX(alter_id) from Cloud for each table             │
│     ├→ Ask Tally: "Records with ALTERID > cloud_max"           │
│     └→ UPSERT only changed records                             │
│                                                                 │
│  3. SAFETY NET:                                                 │
│     └→ Always refresh last 7 days (catches edge cases)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Example: 6-Month Old Edit Detection

```
📆 Original Entry (15-Aug-2025):
┌─────────────────────────────────┐
│ Invoice: INV-001                │
│ Party: Sharma Traders           │
│ Amount: ₹50,000                 │
│ MASTERID: abc-123               │
│ ALTERID: 1001                   │
└─────────────────────────────────┘

📆 Today (01-Feb-2026) - Accountant edits amount:
┌─────────────────────────────────┐
│ Invoice: INV-001                │
│ Party: Sharma Traders           │
│ Amount: ₹52,500  ← Changed!     │
│ MASTERID: abc-123 (Same)        │
│ ALTERID: 89542   ← Increased!   │
└─────────────────────────────────┘

Sync Process:
1. Cloud has: MAX(alter_id) = 85000
2. Tally query: "WHERE ALTERID > 85000"
3. Tally returns: INV-001 (because 89542 > 85000)
4. Cloud UPSERT: WHERE master_id = 'abc-123'
5. ✅ 6-month old entry updated!
```

## Technical Implementation

### 1. TallyConnector.cs - New Methods

```csharp
// Get vouchers modified after specific ALTERID
public async Task<List<Voucher>> GetModifiedVouchersAsync(
    string companyName, 
    long afterAlterId)

// Get ledgers modified after specific ALTERID  
public async Task<List<Ledger>> GetModifiedLedgersAsync(
    string companyName, 
    long afterAlterId)
```

### 2. ApiClient.cs - New Method

```csharp
// Get maximum ALTERID from cloud database
public async Task<long> GetMaxAlterIdAsync(
    string companyId, 
    string tableName)
```

### 3. SyncManager.cs - Enhanced Sync Logic

```csharp
// Check if first sync or incremental
long lastAlterId = await _apiClient.GetMaxAlterIdAsync(companyId, "vouchers");

if (lastAlterId == 0) 
{
    // First sync - fetch all historical data
}
else 
{
    // Incremental - only fetch modified records
    var modified = await _tallyConnector.GetModifiedVouchersAsync(
        companyName, 
        lastAlterId
    );
}
```

## Database Schema

The following columns are used for tracking:

```sql
-- Vouchers table
voucher_id    TEXT PRIMARY KEY
master_id     TEXT              -- Tally's internal ID (never changes)
alter_id      TEXT              -- Modification counter

-- Ledgers table  
id            TEXT PRIMARY KEY
master_id     TEXT
alter_id      TEXT
```

## Comparison: Old vs New

| Scenario | Old (Date-Based) | New (ALTERID-Based) |
|----------|------------------|---------------------|
| New entry today | ✅ Caught | ✅ Caught |
| Edit today's entry | ✅ Caught | ✅ Caught |
| Edit 7-day old entry | ✅ Buffer catches | ✅ Caught |
| Edit 1-month old entry | ❌ **MISSED!** | ✅ Caught |
| Edit 6-month old entry | ❌ **MISSED!** | ✅ Caught |
| Ledger name change | ❌ Not tracked | ✅ Caught |

## Performance

- **First sync**: ~5-10 minutes for 1 year of data
- **Incremental sync**: ~5-30 seconds (only fetches changes)
- **No modifications**: ~2 seconds (just checks ALTERID)

## Troubleshooting

### If modifications aren't being detected:

1. Check `sync_log.txt` for ALTERID values being compared
2. Ensure Tally is returning ALTERID in XML (check `last_tally_response.xml`)
3. Verify Cloud has `alter_id` column populated

### Force full re-sync:

1. Delete all data for company in Supabase
2. Run sync - it will detect empty cloud and do full historical sync

---

**Version**: 2.0  
**Updated**: February 2026  
**Author**: TallyOnMob Development Team
