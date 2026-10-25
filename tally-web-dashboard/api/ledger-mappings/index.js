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
            const response = await databases.listDocuments(databaseId, "ledger_mappings", [
                Query.equal("userId", [userId]),
                Query.equal("clientId", [clientId]),
                Query.orderDesc("createdAt"),
                Query.limit(500)
            ]);

            return res.status(200).json({ mappings: response.documents || [] });
        } catch (error) {
            return res.status(appwriteErrorStatus(error)).json({
                error: error?.message || "Failed to list mappings"
            });
        }
    }

    if (req.method === "POST") {
        const userId = String(req.body?.userId || "").trim();
        const clientId = String(req.body?.clientId || "").trim();
        const normalizedKeyword = String(req.body?.normalizedKeyword || "").trim();
        const ledgerName = String(req.body?.ledgerName || "").trim();

        if (!userId || !clientId || !normalizedKeyword || !ledgerName) {
            return res.status(400).json({
                error: "userId, clientId, normalizedKeyword and ledgerName are required"
            });
        }

        try {
            await assertClientAccess({ databases, userId, clientId });
            const permissions = buildUserPermissions(userId);
            const document = await databases.createDocument(
                databaseId,
                "ledger_mappings",
                appwriteId(),
                {
                    userId,
                    clientId,
                    normalizedKeyword,
                    ledgerName,
                    createdAt: nowIso()
                },
                permissions.length > 0 ? permissions : undefined
            );

            return res.status(200).json({ mapping: document });
        } catch (error) {
            return res.status(appwriteErrorStatus(error)).json({
                error: error?.message || "Failed to save mapping"
            });
        }
    }

    return res.status(405).json({ error: "Method Not Allowed" });
}
