import { Context, Markup } from 'telegraf';
import logger from '../logger';
import { storeSession, getSession, clearSession } from '../services/conversation';
import { getCompanies } from '../supabase/client';
import { startCommand } from './start';

/**
 * Check if the chat has a company selected.
 * If not, prompt the user to select one and return false.
 * If selected, return the companyId.
 */
export async function requireCompany(
  ctx: Context,
  pendingCommand?: string,
  pendingArgs?: any,
): Promise<string | null> {
  const chatId = ctx.chat!.id;
  const session = getSession(chatId);

  if (session.companyId) {
    return session.companyId;
  }

  // Save pending flow so we can resume after selection
  if (pendingCommand) {
    storeSession(chatId, { pendingFlow: { command: pendingCommand, args: pendingArgs } });
  }

  await ctx.replyWithMarkdown(
    '🏢 *Please select a company first*\n\nUse the button below or type /company to choose:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏢 Select Company', callback_data: 'company' }],
          [{ text: '🏠 Main Menu', callback_data: 'start' }],
        ],
      },
    },
  );

  return null;
}

const MAX_BUTTONS_PER_ROW = 2;

/**
 * /company – Show company selection picker.
 */
export async function companyCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat!.id;
  logger.info('Company: command invoked', { chatId });

  await ctx.replyWithMarkdown('🏢 *Loading companies…*');

  const { data: companies, error } = await getCompanies();

  if (error || !companies || companies.length === 0) {
    await ctx.replyWithMarkdown(
      '❌ No companies found. Please contact support.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Main Menu', callback_data: 'start' }],
          ],
        },
      },
    );
    return;
  }

  const keyboard = buildCompanyKeyboard(companies);
  await ctx.replyWithMarkdown(
    '🏢 *Select a Company*\n\nChoose the company whose data you want to view:',
    keyboard,
  );
}

/**
 * Build inline keyboard from company list.
 */
function buildCompanyKeyboard(
  companies: Array<{ id: string; name?: string }>,
) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  let row: ReturnType<typeof Markup.button.callback>[] = [];

  for (const c of companies) {
    const name = c.name || c.id;
    const label = name.length > 30 ? name.slice(0, 28) + '…' : name;
    row.push(Markup.button.callback(label, `company:${c.id}`));
    if (row.length >= MAX_BUTTONS_PER_ROW) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) rows.push(row);
  rows.push([Markup.button.callback('🏠 Main Menu', 'start')]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Handle company selection from inline keyboard.
 * Saves to session and re-dispatches pending flow or shows main menu.
 */
export async function onCompanySelected(ctx: Context, companyId: string): Promise<void> {
  const chatId = ctx.chat!.id;
  logger.info('Company: selected', { chatId, companyId });

  const { data: companies } = await getCompanies();
  const company = companies?.find((c: { id: string; name?: string }) => c.id === companyId);
  const companyName = company?.name || companyId;

  storeSession(chatId, {
    companyId,
    companyName,
  });

  const session = getSession(chatId);
  const pendingFlow = session.pendingFlow;

  if (pendingFlow) {
    storeSession(chatId, { pendingFlow: undefined });
    logger.info('Company: re-dispatching pending flow', { chatId, pendingFlow });
    await reDispatchFlow(ctx, pendingFlow);
    return;
  }

  await ctx.replyWithMarkdown(
    `✅ *Company Selected:* ${companyName}\n\nYou can now use all features with this company's data.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Dashboard', callback_data: 'dashboard' }],
          [{ text: '🏠 Main Menu', callback_data: 'start' }],
        ],
      },
    },
  );
}

/**
 * Re-dispatch a pending flow after company selection.
 */
async function reDispatchFlow(
  ctx: Context,
  flow: { command: string; args?: any },
): Promise<void> {
  const { command, args } = flow;

  switch (command) {
    case 'dashboard':
      return (await import('./dashboard')).dashboardCommand(ctx);
    case 'invoice':
      return (await import('./invoice')).invoiceCommand(ctx);
    case 'ledger':
      return (await import('./ledger')).ledgerCommand(ctx);
    case 'stock':
      return (await import('./stock')).stockCommand(ctx);
    case 'customer':
      return (await import('./customer')).customerCommand(ctx);
    case 'searchAndShowParties':
      return (await import('./invoice')).searchAndShowParties(ctx, args);
    case 'searchAndShowPartiesForLedger':
      return (await import('./ledger')).searchAndShowPartiesForLedger(ctx, args);
    case 'searchAndShowStockItems':
      return (await import('./stock')).searchAndShowStockItems(ctx, args);
    case 'searchAndShowCustomerParties':
      return (await import('./customer')).searchAndShowCustomerParties(ctx, args);
    default:
      return startCommand(ctx);
  }
}
