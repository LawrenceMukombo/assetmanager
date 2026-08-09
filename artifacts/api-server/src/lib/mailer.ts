import { logger } from "./logger";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  delivered: boolean;
  transport: "smtp" | "log";
  messageId?: string;
}

interface SmtpTransporter {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ messageId: string }>;
}

let cachedTransporter: SmtpTransporter | null | undefined;

async function getTransporter(): Promise<SmtpTransporter | null> {
  if (cachedTransporter !== undefined) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    cachedTransporter = null;
    return null;
  }

  try {
    const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
    const mod = (await dynamicImport("nodemailer").catch(() => null)) as
      | { default: { createTransport: (opts: unknown) => SmtpTransporter } }
      | null;
    if (!mod) {
      logger.warn("SMTP_HOST is set but 'nodemailer' is not installed; falling back to log-only email delivery.");
      cachedTransporter = null;
      return null;
    }
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    cachedTransporter = mod.default.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
    return cachedTransporter;
  } catch (err) {
    logger.error({ err }, "Failed to initialise SMTP transporter; falling back to log-only delivery.");
    cachedTransporter = null;
    return null;
  }
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const transporter = await getTransporter();
  const from = process.env.SMTP_FROM ?? "NPAMS <no-reply@npams.local>";

  if (!transporter) {
    logger.warn(
      { to: params.to, subject: params.subject, body: params.text },
      "[mailer] No SMTP configured — logging email instead of sending. Set SMTP_HOST (and optionally SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM) to enable real delivery.",
    );
    return { delivered: false, transport: "log" };
  }

  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
  logger.info({ to: params.to, subject: params.subject, messageId: info.messageId }, "[mailer] Email sent via SMTP");
  return { delivered: true, transport: "smtp", messageId: info.messageId };
}

export function resolveAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  return "http://localhost:5000";
}
