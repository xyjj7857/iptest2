import express from "express";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3030;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/ip", async (req, res) => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch IP' });
    }
  });

  app.post("/api/proxy", async (req, res) => {
    const { url, method, headers, body } = req.body;
    try {
      // Clean up headers to avoid issues with host or other restricted headers
      const cleanHeaders: Record<string, string> = {};
      if (headers) {
        Object.entries(headers).forEach(([key, val]) => {
          const lowerKey = key.toLowerCase();
          if (lowerKey !== 'host' && lowerKey !== 'content-length' && typeof val === 'string') {
            cleanHeaders[key] = val;
          }
        });
      }

      const response = await fetch(url, {
        method,
        headers: cleanHeaders,
        body: method !== 'GET' && body ? JSON.stringify(body) : undefined
      });
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        res.status(response.status).json({ error: `Non-JSON response from Binance (${response.status})`, details: text.slice(0, 500) });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/send-email", async (req, res) => {
    const { from, to, smtp, port, pass, subject, text } = req.body;
    
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtp,
        port: port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user: from,
          pass: pass,
        },
      });

      const info = await transporter.sendMail({
        from: from,
        to: to,
        subject: subject,
        text: text,
      });

      res.json({ success: true, messageId: info.messageId });
    } catch (e: any) {
      console.error('Email Error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
