import { AppError } from '../lib/errors';

/**
 * Thin wrapper around Resend's REST API. We stay on `fetch` to avoid
 * pulling in their SDK for one endpoint — the contract is small.
 *
 * Errors collapse to AppError so callers can let them propagate up to
 * the standard error middleware.
 */

type SendInterviewInviteInput = {
  apiKey: string;
  from: string;
  to: string;
  productName: string;
  interviewUrl: string;
};

export async function sendInterviewInvite(
  input: SendInterviewInviteInput,
): Promise<{ id: string }> {
  const subject = `Quick research interview · ${input.productName}`;
  const text =
    `Hi,\n\n` +
    `I'm running a quick research interview about ${input.productName}.\n` +
    `Should take 5–10 minutes — voice-based, no scheduling needed.\n\n` +
    `${input.interviewUrl}\n\n` +
    `Thanks for helping out.`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError(
      'upstream',
      `Resend send failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!json?.id) {
    throw new AppError('upstream', 'Resend returned no message id');
  }
  return { id: json.id };
}
