#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const { Client, Databases, Query, Permission, Role, ID } = require('node-appwrite');

const appwriteClient = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey('standard_9ab1480c74d3f00b893fb4e8d9b2facc473c33a542f4e7e982b9eeadad6712548e75e2ce50fca1fd7fdcf5bbb4143a05419eecf9290484b9aeaadb37aef157a1309e573fe098e8c0f3c566f2155e982b24c75994dd50bc3698292f07408cf27a2116e305061a2a0260ec9df763d33574642c4878d1d80a22d2cd2afa9636f2a2');

const databases = new Databases(appwriteClient);
const DB_ID = 'tally_sync_db';

const server = new Server(
    {
        name: "tally-appwrite-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "appwrite_list_collections",
                description: "List all collections in the Appwrite database and their structure",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "appwrite_create_collection",
                description: "Create a new collection with default permissions",
                inputSchema: {
                    type: "object",
                    properties: {
                        collectionId: { type: "string" },
                    },
                    required: ["collectionId"],
                },
            },
            {
                name: "appwrite_query",
                description: "Query documents in an Appwrite collection. Unpacks JSON strings automatically.",
                inputSchema: {
                    type: "object",
                    properties: {
                        collectionId: { type: "string" },
                        limit: { type: "number", description: "Default is 100" },
                        offset: { type: "number", description: "Default is 0" },
                        queries: {
                            type: "array",
                            items: { type: "string" },
                            description: "Appwrite query strings, e.g. 'equal(\"company_id\", \"value\")'"
                        }
                    },
                    required: ["collectionId"],
                },
            },
            {
                name: "appwrite_upsert_document",
                description: "Add or update a document in a collection",
                inputSchema: {
                    type: "object",
                    properties: {
                        collectionId: { type: "string" },
                        documentId: { type: "string", description: "Pass literal 'unique' for a new document" },
                        data: { type: "object", description: "The JSON object payload" }
                    },
                    required: ["collectionId", "documentId", "data"],
                },
            }
        ],
    };
});

// Handle tools execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        if (request.params.name === "appwrite_list_collections") {
            const res = await databases.listCollections(DB_ID);
            const output = res.collections.map(c => ({
                id: c.$id,
                name: c.name,
                attributes: c.attributes.map(a => `${a.key} (${a.type})`),
                indexes: c.indexes.map(i => i.key),
            }));
            return {
                content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            };
        }

        if (request.params.name === "appwrite_create_collection") {
            const { collectionId } = request.params.arguments;
            await databases.createCollection(DB_ID, collectionId, collectionId, [
                Permission.read(Role.any()), Permission.create(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())
            ]);
            return {
                content: [{ type: "text", text: `Collection '${collectionId}' created successfully.` }],
            };
        }

        if (request.params.name === "appwrite_query") {
            const { collectionId, limit = 100, offset = 0, queries = [] } = request.params.arguments;
            let appwriteQueries = [Query.limit(limit), Query.offset(offset)];
            // Parse query strings naively or skip for now
            // The SDK allows Query.equal("key", "value"). For simplicity via MCP we can just pass the raw queries if constructed from strings
            for (const q of queries) {
                appwriteQueries.push(q);
            }

            const res = await databases.listDocuments(DB_ID, collectionId, appwriteQueries);

            const docs = res.documents.map(d => {
                let unpacked = {};
                try { if (d.json_data) unpacked = JSON.parse(d.json_data); } catch (e) { }
                const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, json_data, ...rest } = d;
                return { id: $id, ...rest, ...unpacked };
            });

            return {
                content: [{ type: "text", text: JSON.stringify({ total: res.total, results: docs }, null, 2) }],
            };
        }

        if (request.params.name === "appwrite_upsert_document") {
            const { collectionId, documentId, data } = request.params.arguments;

            let targetId = documentId === "unique" ? ID.unique() : documentId;

            const payload = { json_data: JSON.stringify(data) };
            if (data.company_id) payload.company_id = String(data.company_id);
            if (data.name) payload.name = String(data.name);

            let res;
            try {
                if (documentId !== "unique") {
                    try {
                        await databases.getDocument(DB_ID, collectionId, targetId);
                        res = await databases.updateDocument(DB_ID, collectionId, targetId, payload);
                    } catch (e) {
                        if (e.code === 404) {
                            res = await databases.createDocument(DB_ID, collectionId, targetId, payload);
                        } else throw e;
                    }
                } else {
                    res = await databases.createDocument(DB_ID, collectionId, targetId, payload);
                }
            } catch (e) {
                throw new Error(e.message);
            }

            return {
                content: [{ type: "text", text: `Document ${targetId} upserted successfully.` }]
            };
        }

        return {
            content: [{ type: "text", text: `Tool not supported ${request.params.name}` }],
            isError: true
        };
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
