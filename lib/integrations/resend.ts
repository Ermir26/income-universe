import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const isMock = !RESEND_API_KEY;

let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (isMock) {
    console.log(`[Resend/Mock] To: ${params.to} | Subject: ${params.subject}`);
    return true;
  }

  try {
    const { error } = await getClient().emails.send({
      from: params.from || "Income Universe <noreply@incomeuni.com>",
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error("[Resend] Send failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Resend] Error:", err);
    return false;
  }
}

export async function sendColdEmail(
  to: string,
  businessName: string,
  pitch: string
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `AI automation for ${businessName}`,
    html: `<div style="font-family: sans-serif; max-width: 600px;">
      <p>Hi ${businessName} team,</p>
      <p>${pitch}</p>
      <p>Best regards,<br>Income Universe AI</p>
    </div>`,
  });
}

export async function sendNewsletter(
  to: string[],
  subject: string,
  content: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of to) {
    const success = await sendEmail({
      to: recipient,
      subject,
      html: content,
    });
    if (success) sent++;
    else failed++;
  }

  return { sent, failed };
}
