import sanitizeHtml from 'sanitize-html';

/**
 * What the announcement composer's rich-text editor is allowed to produce.
 * Deliberately narrow: every tag here renders correctly with no external
 * stylesheet (plain semantic tags, or inline `style` Quill already emits
 * for color/background) — anything that depends on a class name (Quill's
 * alignment buttons, for one) would just silently do nothing in an email
 * client, so the editor's toolbar is configured to never produce those in
 * the first place. This still sanitizes as if it might anyway.
 */
const OPTS: sanitizeHtml.IOptions = {
  allowedTags: ['h1', 'h2', 'h3', 'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'a', 'blockquote', 'span'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    span: ['style'],
    p: ['style'],
  },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
      'background-color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

/** Strips anything outside the allowed formatting set — scripts, iframes,
 *  event handlers, arbitrary styles/classes — before this HTML is stored,
 *  rendered into an email template, or previewed back to the admin. */
export function sanitizeBody(html: string): string {
  return sanitizeHtml(html, OPTS).trim();
}

/** A plain-text fallback for clients that don't render HTML mail, derived
 *  from the already-sanitized body (so this is a display transform, not a
 *  second line of defense). */
export function bodyToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
