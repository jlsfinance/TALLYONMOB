import { Client, Databases, Query, ID, Permission, Role } from "appwrite";

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://nyc.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "69a06098003b91c827a9";
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "tally_sync_db";

let cachedDatabases = null;

export function getDatabases() {
    if (cachedDatabases) {
        return cachedDatabases;
    }

    const apiKey = process.env.APPWRITE_API_KEY;
    if (!apiKey) {
        throw new Error("APPWRITE_API_KEY is required for server API routes.");
    }

    const client = new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID)
        .setKey(apiKey);

    cachedDatabases = new Databases(client);
    return cachedDatabases;
}

export function getDatabaseId() {
    return APPWRITE_DATABASE_ID;
}

export function appwriteId() {
    return ID.unique();
}

export function parseJsonData(document) {
    if (!document || typeof document !== "object") return {};
    if (!document.json_data || typeof document.json_data !== "string") return {};

    try {
        return JSON.parse(document.json_data);
    } catch (_) {
        return {};
    }
}

export function resolveDocumentField(document, field) {
    if (!document) return undefined;
    if (document[field] !== undefined && document[field] !== null) {
        return document[field];
    }
    const payload = parseJsonData(document);
    return payload[field];
}

export async function findCompanyDocument(databases, clientId) {
    try {
        return await databases.getDocument(APPWRITE_DATABASE_ID, "companies", clientId);
    } catch (_) {
        const response = await databases.listDocuments(APPWRITE_DATABASE_ID, "companies", [
            Query.equal("company_id", [clientId]),
            Query.limit(1)
        ]);

        return response.documents?.[0] || null;
    }
}

export async function assertClientAccess({ databases, userId, clientId }) {
    if (!userId || !clientId) {
        const error = new Error("userId and clientId are required");
        error.code = 400;
        throw error;
    }

    const company = await findCompanyDocument(databases, clientId);
    if (!company) {
        const error = new Error("Client not found");
        error.code = 404;
        throw error;
    }

    const ownerId = resolveDocumentField(company, "owner_id")
        || resolveDocumentField(company, "user_id")
        || resolveDocumentField(company, "created_by");

    if (ownerId && String(ownerId) !== String(userId)) {
        const error = new Error("Forbidden: client does not belong to this user");
        error.code = 403;
        throw error;
    }

    return company;
}

export function buildUserPermissions(userId) {
    if (!userId) return [];

    try {
        return [
            Permission.read(Role.user(userId)),
            Permission.update(Role.user(userId)),
            Permission.delete(Role.user(userId))
        ];
    } catch (_) {
        return [];
    }
}

export function appwriteErrorStatus(error) {
    const status = Number(error?.code || error?.statusCode);
    if (Number.isFinite(status) && status >= 400 && status < 600) {
        return status;
    }
    return 500;
}

export function nowIso() {
    return new Date().toISOString();
}
