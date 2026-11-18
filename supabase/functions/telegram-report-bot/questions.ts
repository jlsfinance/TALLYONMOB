type VoucherKind = "sales" | "purchase" | "receipt" | "payment";
export type Question =
  | { kind: VoucherKind; start: string; end: string; compare?: string }
  | { kind: "balance" | "stock"; name: string }
  | {
    kind:
      | "sync"
      | "setup"
      | "support"
      | "help"
      | "companies"
      | "link"
      | "unlink";
  }
  | { kind: "company"; name: string; byId: boolean };

const localDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const voucherWords = {
  sales: "(?:sales?|बिक्री)",
  purchase: "(?:purchases?|खरीद)",
  receipt: "(?:receipts?|रसीद)",
  payment: "(?:payments?|भुगतान)",
} as const;

export const HELP = [
  "SYNCORA Telegram Bot",
  "Aaj ki sales kitni hai?",
  "Aaj ki sales kal se compare karo",
  "Is mahine ki purchase kitni hui?",
  "Kal ki receipt kitni hui?",
  "Aaj ki payment kitni hai?",
  "Sharma Traders ka balance",
  "Stock Bairathi 105",
  "Last sync",
  "Connector setup · Support",
  "/companies · /link · /unlink",
].join("\n");

export function parseQuestion(input: string, now = new Date()): Question {
  const text = input.trim().replace(/^[\/]/, "").replace(/\?+$/, "").trim()
    .replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  if (/^(link|unlink|companies)$/.test(lower)) {
    return { kind: lower as "link" | "unlink" | "companies" };
  }
  const company = text.match(/^company (id )?(.+)$/i);
  if (company) {
    return { kind: "company", name: company[2], byId: Boolean(company[1]) };
  }
  if (
    /^(last sync|sync status|sync error|status|.*\bsync (?:hui|hua) kya|आखिरी सिंक)$/i
      .test(text)
  ) {
    return { kind: "sync" };
  }
  if (
    /^(?:connector setup|setup|.*connector.*(?:install|download|setup).*)$/i
      .test(text)
  ) {
    return { kind: "setup" };
  }

  if (
    /^(?:support|login help|android login|login (?:kaise karu[n]?|nahi ho raha)|report update nahi hui)$/i
      .test(text)
  ) {
    return { kind: "support" };
  }

  const balance = text.match(/^balance (.+)$/i) ??
    text.match(
      /^(.+?) (?:ka balance(?: kitna hai)?|se kitna lena hai|ko kitna dena hai|का बैलेंस(?: कितना है)?)$/i,
    );
  if (balance) return { kind: "balance", name: balance[1] };
  const stock = text.match(/^stock (.+)$/i) ??
    text.match(/^(.+?) (?:ka stock(?: kitna hai)?|का स्टॉक(?: कितना है)?)$/i);
  if (stock) return { kind: "stock", name: stock[1] };

  for (const [name, word] of Object.entries(voucherWords)) {
    const amountQuestion = new RegExp(
      `^(?:(aaj|kal|is mahin[ey]|आज|कल|इस महीने) (?:ki |ka |की |का )?)?(?:total )?${word}` +
        "(?: (?:kitn[ia] (?:hai|hui|hua)|कितनी (?:है|हुई)|कितना (?:है|हुआ)))?( kal se compare(?: karo)?)?$",
      "i",
    ).exec(text);
    if (!amountQuestion) continue;
    const [, period, comparison] = amountQuestion;
    const today = localDate.format(now);
    const previous = new Date(`${today}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const yesterday = previous.toISOString().slice(0, 10);
    const isYesterday = /^(kal|कल)$/i.test(period ?? "");
    const isMonth = /^(is mahin[ey]|इस महीने)$/i.test(period ?? "");
    if (comparison && (isYesterday || isMonth)) return { kind: "help" };
    return {
      kind: name as VoucherKind,
      start: isMonth
        ? `${today.slice(0, 7)}-01`
        : isYesterday
        ? yesterday
        : today,
      end: isYesterday ? yesterday : today,
      compare: comparison ? yesterday : undefined,
    };
  }
  return { kind: "help" };
}

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});
const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 6 });
const time = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

type Match = {
  name: string;
  current_balance?: number;
  receivable?: number;
  payable?: number;
  current_stock?: number;
  unit?: string;
};
export type Report = {
  company: string;
  last_sync: string | null;
  result:
    | { total?: number; count?: number; status?: string; time?: string }
    | Match[]
    | null;
};

export function renderReport(
  question: Question,
  report: Report,
  previous?: Report,
): string {
  const synced = report.last_sync
    ? time.format(new Date(report.last_sync)) + " IST"
    : "record available nahi";
  const header = `${report.company}\nLast sync: ${synced}`;
  const result = report.result;
  if (question.kind === "sync" && !Array.isArray(result)) {
    const status = result?.status;
    const latest = result?.time
      ? time.format(new Date(result.time)) + " IST"
      : "";
    const line = status === "failed"
      ? "Latest sync failed. PC par SYNCORA Connector kholkar sync log dekhein, Tally aur internet check karein, phir retry karein."
      : status === "running"
      ? "Latest sync abhi chal raha hai."
      : status === "completed"
      ? "Latest sync complete hua."
      : "Latest attempt ka status available nahi hai.";
    return `${header}\n${line}${latest ? `\nLatest attempt: ${latest}` : ""}`;
  }
  if (
    Array.isArray(result) &&
    (question.kind === "stock" || question.kind === "balance")
  ) {
    const exact = result.filter((row) =>
      row.name.toLowerCase() === question.name.toLowerCase()
    );
    const matches = exact.length ? exact : result;
    if (!matches.length) {
      return `${header}\n"${question.name}" ka synced result nahi mila.`;
    }
    if (matches.length > 1) {
      return `${header}\nMultiple matches mile. Exact naam bhejein.\n${
        matches.slice(0, 5).map((r) => "• " + r.name).join("\n")
      }`;
    }
    const row = matches[0];
    if (question.kind === "stock") {
      return `${header}\n${row.name}: ${
        row.current_stock == null
          ? "quantity available nahi"
          : `${quantity.format(row.current_stock)} ${row.unit ?? ""}`.trim()
      }`;
    }
    const balance = row.current_balance;
    const lines = [header, row.name];
    lines.push(
      balance == null
        ? "Ledger balance available nahi"
        : `Ledger balance: ${currency.format(Math.abs(balance))}${
          balance ? (balance > 0 ? " Dr" : " Cr") : ""
        }`,
    );
    if (row.receivable != null) {
      lines.push("Bills receivable: " + currency.format(row.receivable));
    }
    if (row.payable != null) {
      lines.push("Bills payable: " + currency.format(row.payable));
    }
    return lines.join("\n");
  }
  if ("start" in question && result && !Array.isArray(result)) {
    const label = {
      sales: "Sales",
      purchase: "Purchase",
      receipt: "Receipt",
      payment: "Payment",
    }[question.kind];
    const date = question.start === question.end
      ? question.start
      : `${question.start} to ${question.end}`;
    const total = result.total ?? 0;
    const summary = result.count === 0
      ? "koi synced voucher nahi mila"
      : `${currency.format(total)} (${result.count} vouchers)`;
    const lines = [header, `${label} (${date}): ${summary}`];
    if (previous?.result && !Array.isArray(previous.result)) {
      const prior = previous.result.total ?? 0;
      lines.push(
        `Kal (${question.compare}): ${
          previous.result.count
            ? currency.format(prior)
            : "koi synced voucher nahi mila"
        }`,
      );
      lines.push(`Difference: ${currency.format(total - prior)}`);
    }
    return lines.join("\n");
  }
  return HELP;
}
