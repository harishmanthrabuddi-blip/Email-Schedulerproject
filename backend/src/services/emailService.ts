import nodemailer, { Transporter } from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let cachedTransporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const user = process.env.ETHEREAL_USER || 'hillard.robel23@ethereal.email';
  const pass = process.env.ETHEREAL_PASSWORD || process.env.ETHEREAL_PASS || 'Yu7pD94BGyDrqSxzpq';

  try {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.ETHEREAL_PORT || '587', 10),
      secure: false, // Port 587 uses STARTTLS
      auth: { user, pass },
    });
    return cachedTransporter;
  } catch (err) {
    console.warn('[SMTP] Fallback to ephemeral test account...');
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    return cachedTransporter;
  }
}

export interface SendEmailOptions {
  from?: string;
  recipient: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmail({
  from: customFrom,
  recipient,
  subject,
  body,
}: SendEmailOptions): Promise<SendEmailResult> {
  const user = process.env.ETHEREAL_USER || 'hillard.robel23@ethereal.email';
  const fromHeader =
    customFrom ||
    process.env.ETHEREAL_FROM ||
    `Email Scheduler <${user}>`;

  let transport = await getTransporter();

  try {
    const info = await transport.sendMail({
      from: fromHeader,
      to: recipient,
      subject,
      text: body,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    return {
      messageId: info.messageId,
      previewUrl,
    };
  } catch (sendErr: any) {
    console.warn('[SMTP] Retrying email delivery with fresh test account...', sendErr?.message || sendErr);
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    const info = await cachedTransporter.sendMail({
      from: customFrom || `Email Scheduler <${testAccount.user}>`,
      to: recipient,
      subject,
      text: body,
    });
    return {
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info),
    };
  }
}
