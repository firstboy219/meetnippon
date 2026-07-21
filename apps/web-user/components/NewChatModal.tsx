'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { DirectoryUser } from '@/lib/types';

/**
 * Starts a conversation.
 *
 * One person selected is a direct message; two or more becomes a group, which
 * then needs a name. That is the whole rule — no separate "group mode" toggle
 * to get wrong.
 */
export default function NewChatModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const { user } = useAuth();
  const [dir, setDir] = useState<DirectoryUser[]>([]);
  const [picked, setPicked] = useState<DirectoryUser[]>([]);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<DirectoryUser[]>('/users/directory').then(setDir).catch(() => setDir([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chosen = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    return dir
      .filter((u) => u.id !== user?.id && !chosen.has(u.id))
      .filter((u) => !term || `${u.fullName} ${u.email} ${u.department ?? ''}`.toLowerCase().includes(term))
      .slice(0, 40);
  }, [dir, q, chosen, user]);

  const isGroup = picked.length > 1;

  async function start() {
    if (picked.length === 0) return;
    setBusy(true);
    try {
      if (isGroup) {
        const conv = await api.post<{ id: string }>('/chat/conversations/group', {
          name: name.trim() || picked.map((p) => p.fullName.split(' ')[0]).join(', ').slice(0, 60),
          memberIds: picked.map((p) => p.id),
        });
        onCreated(conv.id);
      } else {
        const conv = await api.post<{ id: string }>('/chat/conversations/direct', { userId: picked[0].id });
        onCreated(conv.id);
      }
    } catch (e: any) {
      push(e?.message || t('chat.start_fail'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{t('chat.new_title')}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <p className="modal-sub">{t('chat.new_sub')}</p>

        {picked.length ? (
          <div className="chip-row">
            {picked.map((p) => (
              <span key={p.id} className="chip">
                {p.fullName}
                <button type="button" aria-label={`${t('common.remove')} ${p.fullName}`}
                  onClick={() => setPicked((xs) => xs.filter((x) => x.id !== p.id))}>×</button>
              </span>
            ))}
          </div>
        ) : null}

        {isGroup ? (
          <div className="f-group">
            <label className="f-label">{t('chat.group_name')}</label>
            <input className="f-input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('chat.group_name_ph')} />
          </div>
        ) : null}

        <div className="f-group">
          <input className="f-input" autoFocus value={q} placeholder={t('chat.find_people')}
            onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="people-list">
          {matches.length === 0 ? (
            <div className="empty" style={{ padding: 18 }}>{t('chat.nobody')}</div>
          ) : matches.map((u) => (
            <button type="button" key={u.id} className="people-row"
              onClick={() => { setPicked((xs) => [...xs, u]); setQ(''); }}>
              <span className="chat-avatar">{u.fullName.charAt(0).toUpperCase()}</span>
              <span className="people-body">
                <span className="people-name">{u.fullName}</span>
                <span className="people-sub">{u.email}{u.department ? ` · ${u.department}` : ''}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={busy || picked.length === 0} onClick={start}>
            {busy ? <span className="spinner" /> : isGroup ? t('chat.start_group') : t('chat.start_dm')}
          </button>
        </div>
      </div>
    </div>
  );
}
