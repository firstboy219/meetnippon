'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import NewChatModal from '@/components/NewChatModal';
import type { ChatConversation, ChatMessage } from '@/lib/types';
import { fmtDate, fmtTime, localDateKey, todayLocal } from '@/lib/format';

/** Keys of the Presence enum, mapped to i18n suffixes. */
const PRESENCE_LABEL: Record<string, string> = {
  AVAILABLE: 'available', BUSY: 'busy', DND: 'dnd', AWAY: 'away', OFFLINE: 'offline',
};

/** Group consecutive messages by calendar day, for date separators. */
function withDayBreaks(messages: ChatMessage[]) {
  const out: { day: string; items: ChatMessage[] }[] = [];
  for (const m of messages) {
    const day = localDateKey(m.createdAt);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(m);
    else out.push({ day, items: [m] });
  }
  return out;
}

export default function ChatPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const params = useSearchParams();
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [composing, setComposing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Deep links from a notification or an email land on a specific thread.
  const wanted = params.get('c');

  const loadConvs = useCallback(() => {
    api.get<ChatConversation[]>('/chat/conversations')
      .then((c) => {
        setConvs(c);
        setActiveId((cur) => cur ?? (wanted && c.some((x) => x.id === wanted) ? wanted : c[0]?.id ?? null));
      })
      .catch((e: any) => { if (e?.status === 403) setDisabled(true); });
  }, [wanted]);

  const loadMessages = useCallback((id: string) => {
    api.get<ChatMessage[]>(`/chat/conversations/${id}/messages`).then(setMessages).catch(() => {});
  }, []);

  useEffect(() => { loadConvs(); const i = setInterval(loadConvs, 6000); return () => clearInterval(i); }, [loadConvs]);

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    // Opening a thread is what "reading" means; clear its unread immediately
    // and optimistically, so the badge does not linger for a poll cycle.
    api.post(`/chat/conversations/${activeId}/read`, {}).catch(() => {});
    setConvs((cs) => cs.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)));
    const i = setInterval(() => loadMessages(activeId), 4000);
    return () => clearInterval(i);
  }, [activeId, loadMessages]);

  // Only auto-scroll when already near the bottom — yanking someone away from
  // the history they are reading is worse than a missed scroll.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return convs.filter((c) => !term || c.name.toLowerCase().includes(term));
  }, [convs, q]);

  const active = convs.find((c) => c.id === activeId);
  const other = active && !active.isGroup ? active.others?.[0] : null;

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setDraft('');
    setSending(true);
    try {
      await api.post(`/chat/conversations/${activeId}/messages`, { body });
      loadMessages(activeId);
      loadConvs();
    } catch (e: any) {
      setDraft((d) => d || body);   // give the text back rather than losing it
      push(e?.message || t('chat.send_fail'), 'error');
    } finally {
      setSending(false);
    }
  }

  async function toggleMute() {
    if (!active) return;
    try {
      await api.post(`/chat/conversations/${active.id}/mute`, { muted: !active.muted });
      push(active.muted ? t('chat.unmuted') : t('chat.muted'), 'success');
      loadConvs();
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
  }

  if (disabled) return <div className="empty">{t('chat.disabled')}</div>;

  return (
    <div className="chat">
      <aside className="chat-list">
        <div className="chat-list-head">
          <strong>{t('chat.conversations')}</strong>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            {t('chat.new')}
          </button>
        </div>
        <div className="chat-search">
          <input className="f-input" placeholder={t('chat.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chat-threads">
          {shown.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>{convs.length ? t('chat.no_match') : t('chat.none')}</div>
          ) : shown.map((c) => {
            const peer = !c.isGroup ? c.others?.[0] : null;
            return (
              <button type="button" key={c.id} onClick={() => setActiveId(c.id)}
                className={`chat-thread ${c.id === activeId ? 'active' : ''}`}>
                <span className={`chat-avatar ${peer ? (peer.presence ?? 'OFFLINE').toLowerCase() : 'group'}`}>
                  {c.isGroup ? '#' : (c.name || '?').charAt(0).toUpperCase()}
                </span>
                <span className="chat-thread-body">
                  <span className="chat-thread-top">
                    <span className="chat-thread-name">{c.name}</span>
                    {c.lastMessage ? <span className="chat-thread-time">{fmtTime(c.lastMessage.createdAt)}</span> : null}
                  </span>
                  <span className="chat-thread-last">
                    {c.muted ? '🔕 ' : ''}{c.lastMessage?.body ?? t('chat.no_messages')}
                  </span>
                </span>
                {c.unread ? <span className="chat-unread">{c.unread > 99 ? '99+' : c.unread}</span> : null}
              </button>
            );
          })}
        </div>
      </aside>

      <section className="chat-main">
        {active ? (
          <>
            <header className="chat-head">
              <div>
                <div className="chat-head-name">{active.name}</div>
                <div className="chat-head-sub">
                  {active.isGroup
                    ? `${active.members.length} ${t('chat.members')}`
                    : other
                      ? `${t(`presence.${PRESENCE_LABEL[other.presence ?? 'OFFLINE'] ?? 'offline'}`)}${other.department ? ` · ${other.department}` : ''}`
                      : ''}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={toggleMute}>
                {active.muted ? t('chat.unmute') : t('chat.mute')}
              </button>
            </header>

            <div className="chat-body" ref={listRef}>
              {messages.length === 0 ? (
                <div className="empty">{t('chat.say_hi')}</div>
              ) : withDayBreaks(messages).map((group) => (
                <div key={group.day}>
                  <div className="chat-daybreak">
                    <span>{group.day === todayLocal() ? t('cal.today') : fmtDate(group.items[0].createdAt)}</span>
                  </div>
                  {group.items.map((m, i) => {
                    const out = m.senderId === user?.id;
                    const prev = group.items[i - 1];
                    // Only label a run of messages once — a name on every bubble
                    // is noise in a fast exchange.
                    const showWho = !prev || prev.senderId !== m.senderId;
                    return (
                      <div key={m.id} className={`chat-msg ${out ? 'out' : 'in'} ${showWho ? 'first' : ''}`}>
                        {showWho && !out ? <div className="chat-msg-who">{m.sender?.fullName ?? '—'}</div> : null}
                        <div className="chat-bubble">{m.body}</div>
                        <div className="chat-msg-time">{fmtTime(m.createdAt)}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="chat-compose">
              <input className="f-input" value={draft} placeholder={t('chat.type')}
                onChange={(e) => setDraft(e.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
                onKeyDown={(e) => {
                  // Never send mid-IME composition — that eats the candidate
                  // selection for anyone typing a non-Latin script.
                  if (e.key === 'Enter' && !composing && !(e.nativeEvent as any).isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }} />
              <button className="btn btn-primary" disabled={!draft.trim() || sending} onClick={send}>
                {sending ? <span className="spinner" /> : t('chat.send')}
              </button>
            </div>
          </>
        ) : (
          <div className="empty">{t('chat.select')}</div>
        )}
      </section>

      {showNew ? (
        <NewChatModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); setActiveId(id); loadConvs(); }}
        />
      ) : null}
    </div>
  );
}
