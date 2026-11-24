import { expect } from '@playwright/test';
import './env';

/** Mailpit HTTP API of the local Supabase stack. */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export interface MailMessage {
  id: string;
  subject: string;
  html: string;
  text: string;
  to: string[];
  created: string;
}

interface SearchResponse {
  messages: { ID: string }[];
}

interface MessageResponse {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
  To: { Address: string }[];
  Date: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path} → ${response.status}`);
  return (await response.json()) as T;
}

async function readMessage(id: string): Promise<MailMessage> {
  const m = await getJson<MessageResponse>(`/api/v1/message/${id}`);
  return {
    id: m.ID,
    subject: m.Subject,
    html: m.HTML,
    text: m.Text,
    to: m.To.map((t) => t.Address),
    created: m.Date,
  };
}

/** Messages addressed to `email`, newest first. */
export async function messagesTo(email: string): Promise<MailMessage[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const result = await getJson<SearchResponse>(`/api/v1/search?query=${query}&limit=50`);
  return Promise.all(result.messages.map((m) => readMessage(m.ID)));
}

export async function countMessagesTo(email: string): Promise<number> {
  return (await messagesTo(email)).length;
}

/** Waits for the newest message to `email`, optionally one received after `since`. */
export async function latestMessageTo(
  email: string,
  { since, timeout = 15_000 }: { since?: Date; timeout?: number } = {},
): Promise<MailMessage> {
  let found: MailMessage | undefined;
  await expect
    .poll(
      async () => {
        const [latest] = await messagesTo(email);
        if (latest && (!since || new Date(latest.created).getTime() >= since.getTime() - 1_000)) {
          found = latest;
          return true;
        }
        return false;
      },
      { timeout, message: `email to ${email}` },
    )
    .toBe(true);
  return found!;
}

/** All http(s) links of a message: HTML hrefs and plain-text URLs. */
export function extractLinks(message: Pick<MailMessage, 'html' | 'text'>): string[] {
  const links = new Set<string>();
  for (const match of message.html.matchAll(/href="([^"]+)"/g)) {
    links.add(match[1]!.replaceAll('&amp;', '&'));
  }
  for (const match of message.text.matchAll(/https?:\/\/[^\s<>"]+/g)) links.add(match[0]);
  return [...links];
}

export function findLink(message: Pick<MailMessage, 'html' | 'text'>, pattern: RegExp): string {
  const link = extractLinks(message).find((l) => pattern.test(l));
  if (!link) throw new Error(`No link matching ${pattern}`);
  return link;
}
