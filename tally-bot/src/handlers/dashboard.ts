import { Context } from 'telegraf';
import logger from '../logger';
import { getSupabaseClient } from '../supabase/client';
import { formatIndian, formatDate } from '../utils/formatters';
import { requireCompany } from './company';
import { getSession } from '../services/conversation';

interface DashboardData {
  todaySales: number;
  todayPurchases: number;
  todayCollections: number;
  outstandingDebtors: number;
  totalCustomers: number;
  totalSuppliers: number;
  lowStockItems: Array<{ stock_item_name: string; current_stock: number; unit?: string }>;
  error?: string;
}

/**
 * Fetch all dashboard metrics from Supabase.
 */
async function fetchDashboardData(companyId?: string): Promise<DashboardData> {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const result: DashboardData = {
    todaySales: 0,
    todayPurchases: 0,
    todayCollections: 0,
    outstandingDebtors: 0,
    totalCustomers: 0,
    totalSuppliers: 0,
    lowStockItems: [],
  };

  try {
    // 1. Today's sales: sum of amounts where voucher_type = 'Sales' and date = today
    let salesQuery = supabase
      .from('vouchers')
      .select('amount')
      .eq('voucher_type', 'Sales')
      .gte('voucher_date', today)
      .lte('voucher_date', today);

    if (companyId) salesQuery = salesQuery.eq('company_id', companyId);

    const { data: salesData, error: salesErr } = await salesQuery;

    if (salesErr) {
      logger.warn('Dashboard: error fetching today sales', { error: salesErr.message });
    } else if (salesData) {
      result.todaySales = salesData.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
    }

    // 2. Today's purchases: sum of amounts where voucher_type = 'Purchase' and date = today
    let purchaseQuery = supabase
      .from('vouchers')
      .select('amount')
      .eq('voucher_type', 'Purchase')
      .gte('voucher_date', today)
      .lte('voucher_date', today);

    if (companyId) purchaseQuery = purchaseQuery.eq('company_id', companyId);

    const { data: purchaseData, error: purchaseErr } = await purchaseQuery;

    if (purchaseErr) {
      logger.warn('Dashboard: error fetching today purchases', { error: purchaseErr.message });
    } else if (purchaseData) {
      result.todayPurchases = purchaseData.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
    }

    // 3. Today's collections: sum of amounts where voucher_type = 'Receipt' and date = today
    let collectionQuery = supabase
      .from('vouchers')
      .select('amount')
      .eq('voucher_type', 'Receipt')
      .gte('voucher_date', today)
      .lte('voucher_date', today);

    if (companyId) collectionQuery = collectionQuery.eq('company_id', companyId);

    const { data: collectionData, error: collectionErr } = await collectionQuery;

    if (collectionErr) {
      logger.warn('Dashboard: error fetching today collections', { error: collectionErr.message });
    } else if (collectionData) {
      result.todayCollections = collectionData.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
    }

    // 4. Outstanding from Sundry Debtors (ledgers with parent group matching)
    let debtorsQuery = supabase
      .from('ledgers')
      .select('opening_balance')
      .ilike('parent', '%Sundry Debtors%');

    if (companyId) debtorsQuery = debtorsQuery.eq('company_id', companyId);

    const { data: debtorsData, error: debtorsErr } = await debtorsQuery;

    if (debtorsErr) {
      logger.warn('Dashboard: error fetching debtors', { error: debtorsErr.message });
    } else if (debtorsData) {
      result.outstandingDebtors = debtorsData.reduce(
        (sum, l) => sum + (Number(l.opening_balance) || 0),
        0,
      );
    }

    // 5. Total customers (count of ledgers in Sundry Debtors group)
    let customerQuery = supabase
      .from('ledgers')
      .select('id', { count: 'exact', head: true })
      .ilike('parent', '%Sundry Debtors%');

    if (companyId) customerQuery = customerQuery.eq('company_id', companyId);

    const { count: customerCount, error: customerErr } = await customerQuery;

    if (customerErr) {
      logger.warn('Dashboard: error counting customers', { error: customerErr.message });
    } else if (customerCount !== null) {
      result.totalCustomers = customerCount;
    }

    // 6. Total suppliers (count of ledgers in Sundry Creditors group)
    let supplierQuery = supabase
      .from('ledgers')
      .select('id', { count: 'exact', head: true })
      .ilike('parent', '%Sundry Creditors%');

    if (companyId) supplierQuery = supplierQuery.eq('company_id', companyId);

    const { count: supplierCount, error: supplierErr } = await supplierQuery;

    if (supplierErr) {
      logger.warn('Dashboard: error counting suppliers', { error: supplierErr.message });
    } else if (supplierCount !== null) {
      result.totalSuppliers = supplierCount;
    }

    // 7. Low stock items (quantity < 10)
    let stockQuery = supabase
      .from('stock_items')
      .select('name, current_stock, unit')
      .lt('current_stock', 10);

    if (companyId) stockQuery = stockQuery.eq('company_id', companyId);

    const { data: stockData, error: stockErr } = await stockQuery
      .order('current_stock', { ascending: true })
      .limit(10);

    if (stockErr) {
      logger.warn('Dashboard: error fetching low stock items', { error: stockErr.message });
    } else if (stockData) {
      result.lowStockItems = stockData.map((s: any) => ({
        stock_item_name: s.stock_item_name ?? s.name ?? s.item_name ?? 'Unknown',
        current_stock: Number(s.current_stock ?? s.quantity ?? 0) || 0,
        unit: s.unit,
      }));
    }

    return result;
  } catch (err: any) {
    logger.error('Dashboard: unexpected error', { error: err?.message });
    return { ...result, error: err?.message || 'Unexpected error' };
  }
}

/**
 * Format the dashboard data into a Telegram-friendly Markdown message.
 */
function formatDashboardMessage(data: DashboardData, companyName?: string): string {
  const header = companyName
    ? `📊 *Dashboard — ${companyName}*`
    : '📊 *Dashboard — TallyOnMobile*';

  const lines: string[] = [
    header,
    `📅 *Date:* ${formatDate(new Date().toISOString())}`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '*📈 Today\'s Summary*',
    `🟢  Sales:       ${formatIndian(data.todaySales)}`,
    `🔴  Purchases:   ${formatIndian(data.todayPurchases)}`,
    `💰  Collections: ${formatIndian(data.todayCollections)}`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '*📊 Outstanding & Party Counts*',
    `💳  Debtors Outstanding: ${formatIndian(data.outstandingDebtors)}`,
    `👥  Total Customers:     ${data.totalCustomers}`,
    `🏭  Total Suppliers:     ${data.totalSuppliers}`,
    '',
  ];

  // Low stock warning
  if (data.lowStockItems.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━');
    lines.push('*⚠️ Low Stock Alerts (qty < 10)*');
    for (const item of data.lowStockItems) {
      const unit = item.unit ? ` ${item.unit}` : '';
      lines.push(`• ${item.stock_item_name}: *${item.current_stock}*${unit}`);
    }
  } else {
    lines.push('━━━━━━━━━━━━━━━━━━');
    lines.push('*✅ Stock Status:* No low stock items');
  }

  lines.push('');
  lines.push('Use the menu below to drill down 👇');

  return lines.join('\n');
}

/**
 * /dashboard command handler.
 * Fetches full dashboard data and sends a formatted message.
 */
export async function dashboardCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat!.id;
  const companyId = await requireCompany(ctx, 'dashboard');
  if (!companyId) return;

  logger.info('Dashboard requested', { chatId, companyId });

  await ctx.replyWithMarkdown('📊 *Fetching your dashboard…* Please wait ⏳');

  const data = await fetchDashboardData(companyId);

  if (data.error) {
    await ctx.replyWithMarkdown(
      [
        '⚠️ *Dashboard Error*',
        '',
        'There was a problem fetching some data:',
        `\`${data.error}\``,
        '',
        'Partial data is shown below 👇',
      ].join('\n'),
    );
  }

  const session = getSession(chatId);
  const message = formatDashboardMessage(data, session.companyName);

  await ctx.replyWithMarkdown(message, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Refresh Dashboard', callback_data: 'dashboard' }],
        [{ text: '🏠 Main Menu', callback_data: 'start' }],
      ],
    },
  });
}
