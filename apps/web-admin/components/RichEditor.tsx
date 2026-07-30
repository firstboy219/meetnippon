'use client';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

// Quill touches `document` at import time, so it can only ever run client-side.
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

/**
 * Deliberately no alignment/font/size controls: those rely on Quill's own
 * CSS classes (e.g. `ql-align-center`), which do nothing once the HTML
 * leaves the editor for an email client with no stylesheet attached. Every
 * button here instead produces either a plain semantic tag (`<strong>`,
 * `<h1>`, `<ul><li>`, `<a href>`) or an inline `style` (color/background),
 * both of which render correctly with zero external CSS.
 */
const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'link'],
  ['clean'],
];

export default function RichEditor({ value, onChange, placeholder }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const modules = useMemo(() => ({ toolbar: TOOLBAR }), []);
  return (
    <div className="rich-editor">
      <ReactQuill theme="snow" value={value} onChange={onChange} modules={modules} placeholder={placeholder} />
    </div>
  );
}

/** True once every tag is stripped and nothing but whitespace is left —
 *  Quill's own "empty" state is `<p><br></p>`, not an empty string. */
export function isRichTextEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim().length === 0;
}
