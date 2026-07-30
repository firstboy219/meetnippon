'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { BroadcastRecipient, Page, UserRole } from '@/lib/types';
import { ConfirmModal, Modal } from '@/components/Modal';
import Pager from '@/components/Pager';
import { LoadingRegion, SkeletonRows } from '@/components/Skeleton';
import RichEditor, { isRichTextEmpty } from '@/components/RichEditor';

type Mode = 'ACTIVATION' | 'ANNOUNCEMENT';
const ROLES: UserRole[] = ['EMPLOYEE', 'APPROVER', 'ADMIN'];

interface Template { id: string; label: string; subject: string; bodyHtml: string }

/** Starting points, not a locked script — every field stays fully editable
 *  after picking one. Bracketed placeholders are a nudge to fill in the
 *  specifics, not a format the backend parses. */
const TEMPLATES: Template[] = [
  { id: 'blank', label: 'blast.tpl_blank', subject: '', bodyHtml: '' },
  {
    id: 'general', label: 'blast.tpl_general', subject: 'Pengumuman',
    bodyHtml: '<p>Halo semua,</p><p>[Tulis isi pengumuman di sini]</p><p>Terima kasih.</p>',
  },
  {
    id: 'maintenance', label: 'blast.tpl_maintenance', subject: 'Jadwal Maintenance Sistem',
    bodyHtml: '<p>Halo,</p><p>Sistem akan menjalani maintenance pada <strong>[tanggal &amp; jam]</strong> dan mungkin tidak dapat diakses sementara waktu.</p><p>Mohon maaf atas ketidaknyamanannya.</p>',
  },
  {
    id: 'policy', label: 'blast.tpl_policy', subject: 'Perubahan Kebijakan Booking',
    bodyHtml: '<p>Halo semua,</p><p>Kami ingin menginformasikan perubahan kebijakan berikut:</p><ul><li>[Poin perubahan 1]</li><li>[Poin perubahan 2]</li></ul><p>Berlaku mulai <strong>[tanggal]</strong>.</p>',
  },
  {
    id: 'holiday', label: 'blast.tpl_holiday', subject: 'Informasi Hari Libur',
    bodyHtml: '<p>Halo semua,</p><p>Kantor akan libur pada <strong>[tanggal]</strong> dalam rangka [alasan].</p><p>Selamat berlibur!</p>',
  },
];

export default function BroadcastPage() {
  const { t } = useI18n();
  const { push } = useToast();

  const [mode, setMode] = useState<Mode>('ACTIVATION');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [isActive, setIsActive] = useState('');
  const [hasPassword, setHasPassword] = useState(''); // announcement mode only
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Page<BroadcastRecipient> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);

  const [templateId, setTemplateId] = useState('blank');
  const [subject, setSubject] = useState('');
  const [messageHtml, setMessageHtml] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Debounced so typing in the search box does not fire a request per keystroke.
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => { setTerm(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  // Switching modes resets the picker — the activation blast only ever means
  // "not yet activated", so there is nothing for that filter to say here.
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
    setPage(1);
    if (mode === 'ACTIVATION') setHasPassword('');
  }, [mode]);

  const filter = {
    ...(term ? { q: term } : {}),
    ...(role ? { role } : {}),
    ...(isActive ? { isActive } : {}),
    // Activation mode forces this server-side regardless, but sending it
    // here too keeps the picker's own preview list honest with what will
    // actually be targeted.
    ...(mode === 'ACTIVATION' ? { hasPassword: 'false' } : hasPassword ? { hasPassword } : {}),
  };

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: '25', ...filter });
    api.get<Page<BroadcastRecipient>>(`/admin/broadcast/recipients?${p}`)
      .then(setData).catch(() => setErr(true)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, term, role, isActive, hasPassword, mode]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.items ?? [];
  const filtered = Boolean(term || role || isActive || (mode === 'ANNOUNCEMENT' && hasPassword));

  function toggleOne(id: string) {
    setAllMatching(false);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setAllMatching(false);
    const ids = rows.map((r) => r.id);
    const allOnPage = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      if (allOnPage) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  const recipientCount = allMatching ? (data?.total ?? 0) : selected.size;
  const canSend = mode === 'ACTIVATION'
    ? recipientCount > 0
    : recipientCount > 0 && subject.trim().length > 0 && !isRichTextEmpty(messageHtml);

  function sendPayload() {
    return allMatching
      ? { mode: 'ALL_MATCHING', filter }
      : { mode: 'SELECTED', userIds: [...selected] };
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = TEMPLATES.find((x) => x.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setMessageHtml(tpl.bodyHtml);
  }

  async function openPreview() {
    setPreviewing(true);
    try {
      const res = await api.post<{ html: string }>('/admin/broadcast/announcement/preview', {
        subject: subject.trim() || t('blast.subject_ph'), messageHtml,
      });
      setPreviewHtml(res.html);
    } catch (e: any) {
      push(e?.message || t('common.save_failed'), 'error');
    } finally {
      setPreviewing(false);
    }
  }

  async function send() {
    setSending(true);
    try {
      if (mode === 'ACTIVATION') {
        const res = await api.post<{ sent: number }>('/admin/broadcast/resend-activation', sendPayload());
        push(t('blast.activation_sent').replace('{n}', String(res.sent)), 'success');
      } else {
        const res = await api.post<{ sent: number }>('/admin/broadcast/announcement', {
          ...sendPayload(), subject: subject.trim(), messageHtml,
        });
        push(t('blast.announcement_sent').replace('{n}', String(res.sent)), 'success');
        setSubject(''); setMessageHtml(''); setTemplateId('blank');
      }
      setSelected(new Set());
      setAllMatching(false);
      setConfirming(false);
      load();
    } catch (e: any) {
      push(e?.message || t('common.save_failed'), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="page-head"><h1>{t('blast.title')}</h1></div>

      <div className="row-actions" style={{ marginBottom: 14 }}>
        {(['ACTIVATION', 'ANNOUNCEMENT'] as const).map((m) => (
          <button key={m} type="button" className={`btn ${mode === m ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t(m === 'ACTIVATION' ? 'blast.mode_activation' : 'blast.mode_announcement')}
          </button>
        ))}
      </div>
      <div className="f-hint" style={{ marginTop: -8, marginBottom: 16 }}>
        {t(mode === 'ACTIVATION' ? 'blast.mode_activation_hint' : 'blast.mode_announcement_hint')}
      </div>

      {mode === 'ANNOUNCEMENT' ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="f-group">
            <label className="f-label">{t('blast.template')}</label>
            <select className="f-select" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              {TEMPLATES.map((tpl) => <option key={tpl.id} value={tpl.id}>{t(tpl.label)}</option>)}
            </select>
            <div className="f-hint">{t('blast.template_hint')}</div>
          </div>
          <div className="f-group">
            <label className="f-label">{t('blast.subject')}</label>
            <input className="f-input" value={subject} onChange={(e) => setSubject(e.target.value)}
              maxLength={150} placeholder={t('blast.subject_ph')} />
          </div>
          <div className="f-group" style={{ marginBottom: 10 }}>
            <label className="f-label">{t('blast.message')}</label>
            <RichEditor value={messageHtml} onChange={setMessageHtml} placeholder={t('blast.message_ph')} />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={previewing || isRichTextEmpty(messageHtml)}
            onClick={openPreview}>
            {previewing ? <span className="spinner" /> : t('blast.preview')}
          </button>
        </div>
      ) : null}

      <div className="toolbar">
        <input className="search" placeholder={t('blast.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-pill" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label={t('th.role')}>
          <option value="">{t('users.all_roles')}</option>
          {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
        </select>
        <select className="filter-pill" value={isActive} onChange={(e) => { setIsActive(e.target.value); setPage(1); }} aria-label={t('th.status')}>
          <option value="">{t('users.all_status')}</option>
          <option value="true">{t('status.ACTIVE')}</option>
          <option value="false">{t('status.INACTIVE')}</option>
        </select>
        {mode === 'ANNOUNCEMENT' ? (
          <select className="filter-pill" value={hasPassword}
            onChange={(e) => { setHasPassword(e.target.value); setPage(1); }} aria-label={t('blast.activation_status')}>
            <option value="">{t('blast.activation_any')}</option>
            <option value="true">{t('blast.activated')}</option>
            <option value="false">{t('blast.not_activated')}</option>
          </select>
        ) : null}
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => { setQ(''); setRole(''); setIsActive(''); setHasPassword(''); setPage(1); }}>{t('hist.reset')}</button>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="card"><LoadingRegion label={t('common.loading')}><SkeletonRows rows={6} /></LoadingRegion></div>
      ) : err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : (
        <div className="card">
          <div className="section-head">
            <div className="card-sub">
              {allMatching
                ? t('blast.all_matching_note').replace('{n}', String(data?.total ?? 0))
                : t('blast.selected_note').replace('{n}', String(selected.size))}
            </div>
            {(data?.total ?? 0) > 0 ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAllMatching((v) => !v)}>
                {allMatching ? t('blast.use_manual') : t('blast.select_all_matching').replace('{n}', String(data?.total ?? 0))}
              </button>
            ) : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" disabled={allMatching}
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                      onChange={togglePage} aria-label={t('blast.select_page')} />
                  </th>
                  <th>{t('th.name')}</th>
                  <th>{t('th.email')}</th>
                  <th>{t('th.role')}</th>
                  <th>{t('th.status')}</th>
                  <th>{t('blast.activation_status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} style={allMatching ? { opacity: .5 } : undefined}>
                    <td><input type="checkbox" disabled={allMatching}
                      checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} /></td>
                    <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>{t(`role.${u.role}`)}</td>
                    <td><span className={`badge ${u.isActive ? 'green' : 'grey'}`}>{u.isActive ? t('status.ACTIVE') : t('status.INACTIVE')}</span></td>
                    <td><span className={`badge ${u.hasPassword ? 'green' : 'amber'}`}>{u.hasPassword ? t('blast.activated') : t('blast.not_activated')}</span></td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty">{filtered ? t('users.empty_filtered') : t('blast.empty')}</div></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {data ? (
            <Pager page={data.page} pages={data.pages} total={data.total}
              pageSize={data.pageSize} busy={loading} onPage={setPage} />
          ) : null}
        </div>
      )}

      <div className="modal-footer" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn btn-primary" disabled={!canSend}
          onClick={() => setConfirming(true)}>
          {t(mode === 'ACTIVATION' ? 'blast.send_activation' : 'blast.send_announcement')}
        </button>
      </div>

      {confirming ? (
        <ConfirmModal
          title={t(mode === 'ACTIVATION' ? 'blast.confirm_activation_title' : 'blast.confirm_announcement_title')}
          body={t('blast.confirm_body').replace('{n}', String(recipientCount))}
          confirmLabel={t(mode === 'ACTIVATION' ? 'blast.send_activation' : 'blast.send_announcement')}
          busy={sending} onClose={() => setConfirming(false)} onConfirm={send}
        />
      ) : null}

      {previewHtml !== null ? (
        <Modal title={t('blast.preview_title')} sub={t('blast.preview_sub')} onClose={() => setPreviewHtml(null)} wide
          footer={<button type="button" className="btn btn-primary" onClick={() => setPreviewHtml(null)}>{t('common.done')}</button>}>
          <iframe className="email-preview-frame" srcDoc={previewHtml} title={t('blast.preview_title')} sandbox="" />
        </Modal>
      ) : null}
    </div>
  );
}
