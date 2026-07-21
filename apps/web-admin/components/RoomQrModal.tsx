'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { AdminResource } from '@/lib/types';
import { Modal } from './Modal';

/**
 * The sticker that goes on a meeting-room door.
 *
 * The code encodes the user portal's room page, not an API call — scanning it
 * opens something a person can read, and because that page sits behind the
 * portal's login, a passer-by is asked to sign in before seeing who booked what.
 */
export default function RoomQrModal({ resource, onClose }: {
  resource: AdminResource; onClose: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const [dataUrl, setDataUrl] = useState('');
  const printRef = useRef<HTMLDivElement | null>(null);

  // The portal lives on the bare domain; the console is on admin.<domain>.
  const portalOrigin =
    typeof window === 'undefined' ? '' : window.location.origin.replace(/^https?:\/\/admin\./, 'https://');
  const url = `${portalOrigin}/room/${resource.id}`;

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 720,           // generous, so a printed sticker stays crisp
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#20242B', light: '#FFFFFF' },
    })
      .then(setDataUrl)
      .catch(() => push(t('qr.failed'), 'error'));
  }, [url, push, t]);

  function print() {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { push(t('qr.popup_blocked'), 'error'); return; }
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(resource.name)}</title>
<style>
  @page { margin: 14mm; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
         text-align: center; color: #20242B; }
  .name { font-size: 30px; font-weight: 700; margin: 0 0 4px; }
  .meta { font-size: 15px; color: #6B7178; margin: 0 0 20px; }
  img { width: 320px; height: 320px; }
  .hint { font-size: 15px; margin-top: 18px; }
  .url { font-size: 11px; color: #6B7178; margin-top: 6px; word-break: break-all; }
</style></head><body>
  <p class="name">${escapeHtml(resource.name)}</p>
  <p class="meta">${escapeHtml(resource.floor?.name ?? '')}</p>
  <img src="${dataUrl}" alt="">
  <p class="hint">${escapeHtml(t('qr.print_hint'))}</p>
  <p class="url">${escapeHtml(url)}</p>
</body></html>`);
    w.document.close();
    // Give the image a moment to decode before the print dialog snapshots it.
    w.onload = () => { w.focus(); w.print(); };
  }

  function download() {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${resource.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    a.click();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      push(t('qr.copied'), 'success');
    } catch {
      push(t('qr.copy_failed'), 'error');
    }
  }

  return (
    <Modal title={`${t('qr.title')} — ${resource.name}`} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button>
        <button type="button" className="btn btn-ghost" onClick={copyLink}>{t('qr.copy')}</button>
        <button type="button" className="btn btn-ghost" disabled={!dataUrl} onClick={download}>{t('qr.download')}</button>
        <button type="button" className="btn btn-primary" disabled={!dataUrl} onClick={print}>{t('qr.print')}</button>
      </>}>
      <div className="qr-wrap" ref={printRef}>
        {dataUrl ? <img src={dataUrl} alt={t('qr.title')} className="qr-img" /> : <div className="empty">{t('common.loading')}</div>}
        <div className="qr-url">{url}</div>
      </div>
      <div className="info-box">{t('qr.explain')}</div>
    </Modal>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
