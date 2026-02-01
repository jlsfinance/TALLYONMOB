import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  sendNotification,
  sendMulticastNotification,
  getCompanyTokens,
  getCustomerToken
} from "./firebase-admin";

export async function registerRoutes(app: Express): Promise<Server> {
  // Push Notification Routes

  // Send notification to a single customer
  app.post('/api/push/send', async (req: Request, res: Response) => {
    try {
      const { customerId, title, message, data } = req.body;

      if (!customerId || !title || !message) {
        return res.status(400).json({ error: 'Missing required fields: customerId, title, message' });
      }

      const token = await getCustomerToken(customerId);
      if (!token) {
        return res.status(404).json({ error: 'No FCM token found for this customer' });
      }

      const result = await sendNotification(token, title, message, data);
      return res.json(result);
    } catch (error: any) {
      console.error('Push send error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Send notification to all customers of a company
  app.post('/api/push/broadcast', async (req: Request, res: Response) => {
    try {
      const { companyId, title, message, data } = req.body;

      if (!companyId || !title || !message) {
        return res.status(400).json({ error: 'Missing required fields: companyId, title, message' });
      }

      const tokens = await getCompanyTokens(companyId);
      if (tokens.length === 0) {
        return res.status(404).json({ error: 'No FCM tokens found for this company' });
      }

      const result = await sendMulticastNotification(tokens, title, message, data);
      return res.json(result);
    } catch (error: any) {
      console.error('Push broadcast error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Send notification directly to a token (for testing)
  app.post('/api/push/direct', async (req: Request, res: Response) => {
    try {
      const { token, title, message, data } = req.body;

      if (!token || !title || !message) {
        return res.status(400).json({ error: 'Missing required fields: token, title, message' });
      }

      const result = await sendNotification(token, title, message, data);
      return res.json(result);
    } catch (error: any) {
      console.error('Push direct error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
