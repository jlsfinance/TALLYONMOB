import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { success, error, serverError, unauthorized } from '@/lib/api-response';

// Device API key authentication
async function authenticateDevice(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (!apiKey) return null;

  const device = await prisma.device.findUnique({
    where: { apiKey },
    include: { company: true },
  });

  if (!device || !device.isActive) return null;

  // Update last sync time
  await prisma.device.update({
    where: { id: device.id },
    data: { lastSyncAt: new Date() },
  });

  return device;
}

export async function POST(req: NextRequest) {
  try {
    const device = await authenticateDevice(req);
    if (!device) {
      return unauthorized('Invalid or inactive device API key');
    }

    const body = await req.json();
    const { syncType, ledgers, vouchers, stockItems } = body;
    const companyId = device.companyId;

    // Create sync history record
    const syncHistory = await prisma.syncHistory.create({
      data: {
        companyId,
        deviceId: device.id,
        syncType: syncType || 'full',
        status: 'IN_PROGRESS',
      },
    });

    let totalRecords = 0;
    let newRecords = 0;
    let updatedRecords = 0;

    try {
      // Sync ledgers
      if (ledgers && Array.isArray(ledgers)) {
        for (const ledger of ledgers) {
          const existing = ledger.guid
            ? await prisma.ledger.findUnique({
                where: { companyId_tallyGuid: { companyId, tallyGuid: ledger.guid } },
              })
            : null;

          const data = {
            companyId,
            tallyGuid: ledger.guid || null,
            name: ledger.name,
            alias: ledger.alias || null,
            parent: ledger.parent || 'Primary',
            ledgerType: ledger.ledgerType || null,
            openingBalance: ledger.openingBalance || 0,
            closingBalance: ledger.closingBalance || 0,
            gstin: ledger.gstin || null,
            phone: ledger.phone || null,
            email: ledger.email || null,
            masterId: ledger.masterId || null,
            alterId: ledger.alterId || null,
            syncedAt: new Date(),
          };

          if (existing) {
            await prisma.ledger.update({ where: { id: existing.id }, data });
            updatedRecords++;
          } else {
            await prisma.ledger.create({ data });
            newRecords++;
          }
          totalRecords++;
        }
      }

      // Sync vouchers
      if (vouchers && Array.isArray(vouchers)) {
        for (const voucher of vouchers) {
          const existing = voucher.guid
            ? await prisma.voucher.findUnique({
                where: { companyId_tallyGuid: { companyId, tallyGuid: voucher.guid } },
              })
            : null;

          const voucherData = {
            companyId,
            tallyGuid: voucher.guid || null,
            voucherNumber: voucher.voucherNumber,
            voucherType: voucher.voucherType,
            voucherDate: new Date(voucher.date),
            partyName: voucher.partyName || 'Unknown',
            narration: voucher.narration || null,
            referenceNumber: voucher.reference || null,
            totalAmount: voucher.totalAmount || 0,
            grandTotal: voucher.totalAmount || 0,
            isCancelled: voucher.isCancelled || false,
            masterId: voucher.masterId || null,
            alterId: voucher.alterId || null,
            syncBatchId: syncHistory.id,
            syncedAt: new Date(),
          };

          let voucherRecord;
          if (existing) {
            voucherRecord = await prisma.voucher.update({
              where: { id: existing.id },
              data: voucherData,
            });
            // Delete old entries for re-sync
            await prisma.voucherLedgerEntry.deleteMany({ where: { voucherId: existing.id } });
            await prisma.voucherStockEntry.deleteMany({ where: { voucherId: existing.id } });
            updatedRecords++;
          } else {
            voucherRecord = await prisma.voucher.create({ data: voucherData });
            newRecords++;
          }

          // Create ledger entries
          if (voucher.ledgerEntries && Array.isArray(voucher.ledgerEntries)) {
            for (const entry of voucher.ledgerEntries) {
              await prisma.voucherLedgerEntry.create({
                data: {
                  companyId,
                  voucherId: voucherRecord.id,
                  ledgerName: entry.ledgerName,
                  amount: entry.amount || 0,
                  isDebit: entry.isDebit || false,
                },
              });
            }
          }

          // Create stock entries
          if (voucher.stockEntries && Array.isArray(voucher.stockEntries)) {
            for (const entry of voucher.stockEntries) {
              await prisma.voucherStockEntry.create({
                data: {
                  companyId,
                  voucherId: voucherRecord.id,
                  stockItemName: entry.itemName,
                  quantity: entry.quantity || 0,
                  unit: entry.unit || null,
                  rate: entry.rate || 0,
                  amount: entry.amount || 0,
                },
              });
            }
          }

          totalRecords++;
        }
      }

      // Sync stock items
      if (stockItems && Array.isArray(stockItems)) {
        for (const item of stockItems) {
          const existing = item.guid
            ? await prisma.stockItem.findUnique({
                where: { companyId_tallyGuid: { companyId, tallyGuid: item.guid } },
              })
            : null;

          const data = {
            companyId,
            tallyGuid: item.guid || null,
            name: item.name,
            alias: item.alias || null,
            stockGroup: item.stockGroup || 'Primary',
            stockCategory: item.category || null,
            unit: item.unit || null,
            hsnCode: item.hsnCode || null,
            gstRate: item.gstRate || null,
            openingBalance: item.openingBalance || 0,
            openingValue: item.openingValue || 0,
            closingBalance: item.closingBalance || 0,
            closingValue: item.closingValue || 0,
            rate: item.rate || null,
            masterId: item.masterId || null,
            alterId: item.alterId || null,
            syncedAt: new Date(),
          };

          if (existing) {
            await prisma.stockItem.update({ where: { id: existing.id }, data });
            updatedRecords++;
          } else {
            await prisma.stockItem.create({ data });
            newRecords++;
          }
          totalRecords++;
        }
      }

      // Mark sync as completed
      await prisma.syncHistory.update({
        where: { id: syncHistory.id },
        data: {
          status: 'COMPLETED',
          totalRecords,
          newRecords,
          updatedRecords,
          completedAt: new Date(),
          duration: Math.floor((Date.now() - syncHistory.startedAt.getTime()) / 1000),
        },
      });

      return success({
        syncId: syncHistory.id,
        status: 'completed',
        totalRecords,
        newRecords,
        updatedRecords,
      });
    } catch (syncError) {
      // Mark sync as failed
      await prisma.syncHistory.update({
        where: { id: syncHistory.id },
        data: {
          status: 'FAILED',
          errorMessage: syncError instanceof Error ? syncError.message : 'Unknown error',
          completedAt: new Date(),
        },
      });
      throw syncError;
    }
  } catch (e) {
    console.error('Sync error:', e);
    return serverError();
  }
}

// GET sync history
export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');

    if (apiKey) {
      const device = await prisma.device.findUnique({ where: { apiKey } });
      if (!device) return unauthorized();
      companyId && (companyId !== device.companyId) && unauthorized();

      const history = await prisma.syncHistory.findMany({
        where: { companyId: device.companyId },
        orderBy: { startedAt: 'desc' },
        take: 20,
      });
      return success(history);
    }

    if (!companyId) return error('companyId is required');
    const history = await prisma.syncHistory.findMany({
      where: { companyId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return success(history);
  } catch (e) {
    return serverError();
  }
}
