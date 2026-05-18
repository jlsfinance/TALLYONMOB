import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import {
  sendNotification,
  sendMulticastNotification,
  getCompanyTokens,
  getCustomerToken
} from "./firebase-admin";

// ---------------------------------------------------------------------------
// API Key authentication middleware
// ---------------------------------------------------------------------------

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  // If no API_KEY is configured, allow all (dev-friendly fallback)
  const configuredKey = process.env.API_KEY;
  if (!configuredKey) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <API_KEY>" });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (token !== configuredKey) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (per-IP sliding window)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Clean stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

function rateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || entry.resetAt <= now) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.status(429).json({
        error: "Too many requests. Please slow down.",
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

const TITLE_MAX = 200;
const MESSAGE_MAX = 4000;

function sanitize(str: string): string {
  return str
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function validatePushInput(
  title: unknown,
  message: unknown,
): string | null {
  if (typeof title !== "string" || title.trim().length === 0) {
    return "title is required and must be a non-empty string";
  }
  if (title.length > TITLE_MAX) {
    return `title must be at most ${TITLE_MAX} characters`;
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    return "message is required and must be a non-empty string";
  }
  if (message.length > MESSAGE_MAX) {
    return `message must be at most ${MESSAGE_MAX} characters`;
  }
  return null; // valid
}

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin || "*";

  // Allow known origins, or anything in dev
  const allowedOrigins = [
    "http://localhost:5000",
    "http://localhost:3000",
    "capacitor://localhost",
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : []),
  ];

  if (origin === "*" || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerRoutes(app: Express): Promise<Server> {
  // ---- Global CORS ----
  app.use(corsMiddleware);

  // ---- Health endpoint (no auth required) ----
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage().rss,
    });
  });

  // ---- Push Notification Routes (auth + rate limit + validation) ----

  const pushRateLimit = rateLimiter(30, 60_000); // 30 req/min per IP

  // Send notification to a single customer
  app.post("/api/push/send", requireApiKey, pushRateLimit, async (req: Request, res: Response) => {
    try {
      const { customerId, title, message, data } = req.body;

      if (!customerId || typeof customerId !== "string") {
        return res.status(400).json({ error: "Missing required field: customerId must be a string" });
      }

      const validationError = validatePushInput(title, message);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const sanitizedTitle = sanitize(title);
      const sanitizedMessage = sanitize(message);

      const token = await getCustomerToken(customerId);
      if (!token) {
        return res.status(404).json({ error: "No FCM token found for this customer" });
      }

      const result = await sendNotification(token, sanitizedTitle, sanitizedMessage, data);
      return res.json(result);
    } catch (error: any) {
      console.error("Push send error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Send notification to all customers of a company
  app.post("/api/push/broadcast", requireApiKey, pushRateLimit, async (req: Request, res: Response) => {
    try {
      const { companyId, title, message, data } = req.body;

      if (!companyId || typeof companyId !== "string") {
        return res.status(400).json({ error: "Missing required field: companyId must be a string" });
      }

      const validationError = validatePushInput(title, message);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const sanitizedTitle = sanitize(title);
      const sanitizedMessage = sanitize(message);

      const tokens = await getCompanyTokens(companyId);
      if (tokens.length === 0) {
        return res.status(404).json({ error: "No FCM tokens found for this company" });
      }

      const result = await sendMulticastNotification(tokens, sanitizedTitle, sanitizedMessage, data);
      return res.json(result);
    } catch (error: any) {
      console.error("Push broadcast error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Send notification directly to a token (for testing)
  app.post("/api/push/direct", requireApiKey, pushRateLimit, async (req: Request, res: Response) => {
    try {
      const { token, title, message, data } = req.body;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Missing required field: token must be a string" });
      }

      const validationError = validatePushInput(title, message);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const sanitizedTitle = sanitize(title);
      const sanitizedMessage = sanitize(message);

      const result = await sendNotification(token, sanitizedTitle, sanitizedMessage, data);
      return res.json(result);
    } catch (error: any) {
      console.error("Push direct error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
