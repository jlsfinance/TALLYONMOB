import {
    getDatabases,
    getDatabaseId,
    appwriteId,
    buildUserPermissions,
    assertClientAccess,
    appwriteErrorStatus,
    nowIso
} from "../_lib/appwrite.js";
import { Query } from "appwrite";

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function normalizeInvoicePayload(payload = {}) {
    const gstin = String(payload.gstin || "").trim().toUpperCase();
    const invoiceNumber = String(payload.invoiceNumber || payload.invoice_number || "").trim();
    const date = String(payload.date || payload.invoiceDate || payload.invoice_date || "").trim();

    return {
        gstin,
        invoiceNumber,
        date,
        taxableValue: toNumber(payload.taxableValue ?? payload.taxable_value),
        cgst: toNumber(payload.cgst),
        sgst: toNumber(payload.sgst),
        igst: toNumber(payload.igst),
        hsn: String(payload.hsn || payload.hsnCode || payload.hsn_code || "").trim(),
        invoiceType: gstin ? "B2B" : "B2C"
    };
}

export default async function handler(req, res) {
    const databases = getDatabases();
    const databaseId = getDatabaseId();

    if (req.method === "GET") {
        const userId = String(req.query?.userId || "").trim();
        const clientId = String(req.query?.clientId || "").trim();

        if (!userId || !clientId) {
            return res.status(400).json({ error: "userId and clientId are required" });
        }

        try {
            await assertClientAccess({ databases, userId, clientId });
            const response = await databases.listDocuments(databaseId, "invoices", [
                Query.equal("userId", [userId]),
                Query.equal("clientId", [clientId]),
                Query.orderDesc("createdAt"),
                Query.limit(5000)
            ]);

            return res.status(200).json({ invoices: response.documents || [] });
        } catch (error) {
            return res.status(appwriteErrorStatus(error)).json({
                error: error?.message || "Failed to list invoices"
            });
        }
    }

    if (req.method === "POST") {
        const userId = String(req.body?.userId || "").trim();
        const clientId = String(req.body?.clientId || "").trim();
        const invoice = normalizeInvoicePayload(req.body?.invoice || {});

        if (!userId || !clientId) {
            return res.status(400).json({ error: "userId and clientId are required" });
        }

        if (!invoice.invoiceNumber) {
            return res.status(400).json({ error: "invoiceNumber is required" });
        }

        try {
            await assertClientAccess({ databases, userId, clientId });

            const permissions = buildUserPermissions(userId);
            const document = await databases.createDocument(
                databaseId,
                "invoices",
                appwriteId(),
                {
                    userId,
                    clientId,
                    ...invoice,
                    createdAt: nowIso()
                },
                permissions.length > 0 ? permissions : undefined
            );

            return res.status(200).json({ invoice: document });
        } catch (error) {
            return res.status(appwriteErrorStatus(error)).json({
                error: error?.message || "Failed to save invoice"
            });
        }
    }

    return res.status(405).json({ error: "Method Not Allowed" });
}
