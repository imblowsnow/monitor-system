import nodemailer from 'nodemailer';

interface NotifyChannel {
  type: string;
  config: Record<string, string>;
}

interface NotifyPayload {
  title: string;
  message: string;
}

class NotifyService {
  async send(channel: NotifyChannel, payload: NotifyPayload) {
    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmail(channel.config, payload);
          break;
        case 'telegram':
          await this.sendTelegram(channel.config, payload);
          break;
        case 'wechat_work':
          await this.sendWechatWork(channel.config, payload);
          break;
        case 'webhook':
          await this.sendWebhook(channel.config, payload);
          break;
        default:
          console.warn(`Unknown notify channel: ${channel.type}`);
      }
    } catch (error) {
      console.error(`Notify send failed (${channel.type}):`, error);
    }
  }

  private async sendEmail(config: Record<string, string>, payload: NotifyPayload) {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: parseInt(config.port || '587'),
      secure: config.secure === 'true',
      auth: { user: config.user, pass: config.pass },
    });
    await transporter.sendMail({
      from: config.from || config.user,
      to: config.to,
      subject: payload.title,
      text: payload.message,
    });
  }

  private async sendTelegram(config: Record<string, string>, payload: NotifyPayload) {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: `${payload.title}\n\n${payload.message}`,
        parse_mode: 'HTML',
      }),
    });
  }

  private async sendWechatWork(config: Record<string, string>, payload: NotifyPayload) {
    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: `${payload.title}\n${payload.message}` },
      }),
    });
  }

  private async sendWebhook(config: Record<string, string>, payload: NotifyPayload) {
    await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
}

export const notifyService = new NotifyService();
