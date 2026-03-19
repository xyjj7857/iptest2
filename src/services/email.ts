import { AppSettings } from "../types";

export class EmailService {
  static async sendNotification(settings: AppSettings) {
    const { from, to, smtp, port, pass } = settings.email;
    const { supaName } = settings.supabase;

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          smtp,
          port,
          pass,
          subject: supaName,
          text: supaName,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }
      return data;
    } catch (e) {
      console.error('Email Service Error:', e);
      throw e;
    }
  }
}
