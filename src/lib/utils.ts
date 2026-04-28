import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extracts an `[Attachment: name](url)` tag embedded in description/cover-letter text. */
export function parseAttachment(text: string): { body: string; attachment?: { name: string; url: string } } {
  const re = /\[Attachment:\s*([^\]]+)\]\((https?:\/\/[^)]+)\)/i;
  const match = re.exec(text);
  if (!match) return { body: text };
  return {
    body: text.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trim(),
    attachment: { name: match[1].trim(), url: match[2].trim() },
  };
}
