import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export const transporter = nodemailer.createTransport({
  host: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.ETHEREAL_PORT || '587', 10),
  secure: false, // Port 587 uses STARTTLS
  auth: {
    user: process.env.ETHEREAL_USER,
    pass: process.env.ETHEREAL_PASSWORD || process.env.ETHEREAL_PASS,
  },
});

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
  const fromHeader =
    customFrom ||
    process.env.ETHEREAL_FROM ||
    `Email Scheduler <${process.env.ETHEREAL_USER || 'no-reply@ethereal.email'}>`;

  const info = await transporter.sendMail({
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
}
