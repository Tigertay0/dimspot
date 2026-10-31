import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Outgoing email: account verification and password reset.
 *
 * Sent through Cloudflare Email Sending (the EMAIL binding in wrangler.jsonc)
 * from a subdomain onboarded with `npx wrangler email sending enable`. Outside a
 * Worker there is no binding; in development the message is written to the
 * server log instead so the link can still be followed.
 */

interface EmailAddress {
  email: string;
  name?: string;
}

interface EmailBinding {
  send(message: {
    from: string | EmailAddress;
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId: string }>;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const DEFAULT_FROM = "noreply@mail.adetayo.dev";
const SENDER_NAME = "Outage Tracker";

/**
 * Guest accounts carry a placeholder address on the reserved `.invalid` TLD
 * (RFC 6761). Nothing can receive mail there, so it is never worth sending.
 */
function undeliverable(address: string): boolean {
  return address.toLowerCase().endsWith(".invalid");
}

function emailBinding(): EmailBinding | null {
  try {
    const { env } = getCloudflareContext() as unknown as {
      env: { EMAIL?: EmailBinding };
    };
    return env.EMAIL ?? null;
  } catch {
    return null;
  }
}

export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  if (undeliverable(mail.to)) return;

  const binding = emailBinding();
  if (!binding) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("The EMAIL binding is missing; check wrangler.jsonc.");
    }
    console.info(`[email] not sent (no EMAIL binding) to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }

  await binding.send({
    from: { email: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM, name: SENDER_NAME },
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A one-link message, in plain text and minimal HTML. */
export function linkEmail(
  to: string,
  subject: string,
  intro: string,
  action: string,
  url: string,
  outro: string,
): OutgoingEmail {
  const href = escapeHtml(url);
  return {
    to,
    subject,
    text: `${intro}\n\n${action}: ${url}\n\n${outro}\n`,
    html: [
      `<p>${escapeHtml(intro)}</p>`,
      `<p><a href="${href}">${escapeHtml(action)}</a></p>`,
      `<p style="color:#666;font-size:13px">${escapeHtml(outro)}</p>`,
      `<p style="color:#666;font-size:13px">If the button does not work, paste this into your browser:<br>${href}</p>`,
    ].join("\n"),
  };
}
