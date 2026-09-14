/**
 * Thin Resend wrapper — the only place that talks to an email provider.
 * Without RESEND_API_KEY set, this degrades to logging the email instead
 * of throwing, so the reminder pipeline (scheduling, due-detection,
 * marking-as-sent) is fully runnable and testable without needing a real
 * Resend account.
 */

export interface SendReminderInput {
  to: string;
  company: string;
  role: string;
}

export async function sendReminderEmail(input: SendReminderInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[email skipped — RESEND_API_KEY not set] Would remind ${input.to} about their ` +
        `${input.role} application at ${input.company}`,
    );
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.REMINDER_FROM_EMAIL ?? "reminders@example.com",
    to: input.to,
    subject: `Follow up: your ${input.company} application`,
    text:
      `It's been a week since you applied for ${input.role} at ${input.company} ` +
      `with no status update. Worth sending a follow-up?`,
  });
}
