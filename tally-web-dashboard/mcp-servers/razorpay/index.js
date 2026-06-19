import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Razorpay from "razorpay";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_T3S0jFUAo5tIfQ";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "wZjVInTwZA7TVRolqY02tYTh";

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

const server = new McpServer({
  name: "razorpay",
  version: "1.0.0",
});

// Tool: Create Order
server.tool(
  "create_order",
  "Create a new Razorpay order for payment collection",
  {
    amount: z.number().describe("Amount in INR (will be converted to paise)"),
    currency: z.string().default("INR").describe("Currency code"),
    receipt: z.string().optional().describe("Receipt reference number"),
    notes: z.record(z.string()).optional().describe("Key-value notes for the order"),
  },
  async ({ amount, currency, receipt, notes }) => {
    try {
      const order = await razorpay.orders.create({
        amount: amount * 100, // Convert to paise
        currency: currency || "INR",
        receipt: receipt || `rcpt_${Date.now()}`,
        notes: notes || {},
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              orderId: order.id,
              amount: order.amount,
              currency: order.currency,
              status: order.status,
              createdAt: order.created_at,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
      };
    }
  }
);

// Tool: Verify Payment
server.tool(
  "verify_payment",
  "Verify a Razorpay payment after checkout",
  {
    paymentId: z.string().describe("Razorpay payment ID (pay_xxx)"),
    orderId: z.string().describe("Razorpay order ID (order_xxx)"),
    signature: z.string().describe("Razorpay signature for verification"),
  },
  async ({ paymentId, orderId, signature }) => {
    try {
      const crypto = await import("crypto");
      const expectedSignature = crypto.default
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      const isValid = expectedSignature === signature;

      if (isValid) {
        const payment = await razorpay.payments.fetch(paymentId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                verified: true,
                paymentId: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                method: payment.method,
                captured: payment.captured,
                createdAt: payment.created_at,
              }, null, 2),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, verified: false, error: "Signature mismatch" }),
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
      };
    }
  }
);

// Tool: Get Payment Details
server.tool(
  "get_payment",
  "Fetch details of a specific Razorpay payment",
  {
    paymentId: z.string().describe("Razorpay payment ID (pay_xxx)"),
  },
  async ({ paymentId }) => {
    try {
      const payment = await razorpay.payments.fetch(paymentId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              paymentId: payment.id,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              method: payment.method,
              description: payment.description,
              email: payment.email,
              contact: payment.contact,
              captured: payment.captured,
              createdAt: payment.created_at,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
      };
    }
  }
);

// Tool: Create Refund
server.tool(
  "create_refund",
  "Create a full or partial refund for a payment",
  {
    paymentId: z.string().describe("Razorpay payment ID (pay_xxx)"),
    amount: z.number().optional().describe("Refund amount in INR (omit for full refund)"),
    notes: z.record(z.string()).optional().describe("Notes for the refund"),
  },
  async ({ paymentId, amount, notes }) => {
    try {
      const refundData = {};
      if (amount) refundData.amount = amount * 100;
      if (notes) refundData.notes = notes;

      const refund = await razorpay.payments.refund(paymentId, refundData);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              refundId: refund.id,
              paymentId: refund.payment_id,
              amount: refund.amount,
              status: refund.status,
              createdAt: refund.created_at,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
      };
    }
  }
);

// Tool: Get Order Details
server.tool(
  "get_order",
  "Fetch details of a specific Razorpay order",
  {
    orderId: z.string().describe("Razorpay order ID (order_xxx)"),
  },
  async ({ orderId }) => {
    try {
      const order = await razorpay.orders.fetch(orderId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              orderId: order.id,
              amount: order.amount,
              currency: order.currency,
              status: order.status,
              receipt: order.receipt,
              notes: order.notes,
              createdAt: order.created_at,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
      };
    }
  }
);

// Tool: List Payments
server.tool(
  "list_payments",
  "List recent Razorpay payments with optional filters",
  {
    count: z.number().default(10).describe("Number of payments to fetch (max 100)"),
    from: z.string().optional().describe("Start timestamp (unix seconds)"),
    to: z.string().optional().describe("End timestamp (unix seconds)"),
  },
  async ({ count, from, to }) => {
    try {
      const options = { count: Math.min(count, 100) };
      if (from) options.from = parseInt(from);
      if (to) options.to = parseInt(to);

      const payments = await razorpay.payments.all(options);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              count: payments.count,
              payments: payments.items.map((p) => ({
                id: p.id,
                amount: p.amount,
                currency: p.currency,
                status: p.status,
                method: p.method,
                email: p.email,
                createdAt: p.created_at,
              })),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
      };
    }
  }
);

// Tool: Test Connection
server.tool(
  "test_connection",
  "Test Razorpay API connection and verify credentials",
  {},
  async () => {
    try {
      const order = await razorpay.orders.create({
        amount: 100,
        currency: "INR",
        receipt: "test_connection",
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Razorpay connection successful",
              keyId: RAZORPAY_KEY_ID,
              testOrderId: order.id,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              message: "Razorpay connection failed",
              error: error.message,
              keyId: RAZORPAY_KEY_ID,
            }),
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Razorpay MCP Server running on stdio");
}

main().catch(console.error);
