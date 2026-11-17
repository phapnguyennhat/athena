import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';
import { createTransport, type Transporter } from 'nodemailer';
import type { EnvironmentVariables } from '../config/env.validation.js';

// Copy of packages/app/assets/brand/athena-owl-light@3x.png (84px, shown at 44px for sharp retina rendering).
const LOGO_PATH = join(import.meta.dirname, 'assets', 'athena-owl.png');

/** Each template in ./templates (`<name>.hbs`) and the values it renders. */
export interface MailTemplates {
  'verify-email': { fullName: string; code: string; expiresInMinutes: number };
}

export interface MailMessage<T extends keyof MailTemplates> {
  to: string;
  subject: string;
  template: T;
  context: MailTemplates[T];
  /** Plain-text alternative for clients that don't render HTML. */
  text: string;
}

@Injectable()
export class MailService implements OnApplicationShutdown {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  // Compiled once at startup; `{{ }}` HTML-escapes every value.
  private readonly templates = new Map<string, HandlebarsTemplateDelegate>(
    readdirSync(join(import.meta.dirname, 'templates'))
      .filter((file) => file.endsWith('.hbs'))
      .map((file) => [
        file.slice(0, -'.hbs'.length),
        Handlebars.compile(readFileSync(join(import.meta.dirname, 'templates', file), 'utf8'), { strict: true }),
      ]),
  );

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const secure = config.get('SMTP_SECURE', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure,
      // Production never sends codes in clear text: without implicit TLS, STARTTLS is mandatory.
      requireTLS: !secure && config.get('NODE_ENV', { infer: true }) === 'production',
      auth: user ? { user, pass: config.get('SMTP_PASSWORD', { infer: true }) } : undefined,
      pool: true,
    });
  }

  async send<T extends keyof MailTemplates>({ to, subject, template, context, text }: MailMessage<T>): Promise<void> {
    const render = this.templates.get(template);
    if (!render) throw new Error(`Mail template "${template}" not found`);
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html: render(context),
      text,
      // Inline logo, shown by templates as <img src="cid:athena-logo">: no public image hosting needed.
      attachments: [{ filename: 'athena-owl.png', path: LOGO_PATH, cid: 'athena-logo' }],
    });
    this.logger.log(`Sent "${template}" mail ${info.messageId}`);
  }

  onApplicationShutdown() {
    this.transporter.close();
  }
}
