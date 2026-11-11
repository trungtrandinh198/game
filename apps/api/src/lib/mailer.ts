import nodemailer from "nodemailer";
import type { EmailContent } from "./email-templates";

export interface OutgoingMail extends EmailContent {
  to: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

/** Gom thư trong bộ nhớ (test, hoặc dev chưa cấu hình SMTP). */
export class MemoryMailer implements Mailer {
  readonly outbox: OutgoingMail[] = [];

  async send(mail: OutgoingMail) {
    this.outbox.push(mail);
  }

  last(to?: string): OutgoingMail | undefined {
    return [...this.outbox].reverse().find((m) => !to || m.to === to);
  }
}

export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    },
  };
}
