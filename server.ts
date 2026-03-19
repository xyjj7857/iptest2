import express from "express";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/ip", async (req, res) => {
    const services = [
      'https://api.ipify.org?format=json',
      'https://api64.ipify.org?format=json',
      'https://ifconfig.me/all.json',
      'https://ipinfo.io/json'
    ];

    for (const service of services) {
      try {
        const response = await fetch(service, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const data = await response.json();
          const ip = data.ip || data.ip_addr || data.query;
          if (ip) {
            return res.json({ ip });
          }
        }
      } catch (e) {
        console.error(`Failed to fetch IP from ${service}:`, e);
      }
    }
    res.status(500).json({ error: 'Failed to fetch IP from all services' });
  });

  app.post("/api/proxy", async (req, res) => {
    const { url, method, headers, body } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[Proxy] ${method} ${url} | Client: ${clientIp}`);
    
    try {
      const cleanHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      
      if (headers) {
        Object.entries(headers).forEach(([key, val]) => {
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'x-mbx-apikey' || lowerKey === 'content-type') {
            cleanHeaders[key] = val as string;
          }
        });
      }

      const fetchOptions: RequestInit = {
        method,
        headers: cleanHeaders,
        // Ensure we don't follow redirects to sensitive internal IPs
        redirect: 'follow',
      };

      if (method !== 'GET' && body) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (!response.ok) {
          console.error(`[Proxy] Binance Error (${response.status}):`, JSON.stringify(data));
        }
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        console.error(`[Proxy] Non-JSON Response (${response.status}):`, text.slice(0, 200));
        res.status(response.status).json({ 
          error: `Non-JSON response from Binance (${response.status})`, 
          details: text.slice(0, 500) 
        });
      }
    } catch (e: any) {
      console.error(`[Proxy] Error:`, e.message);
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
