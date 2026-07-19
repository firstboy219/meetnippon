'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { ChatConversation, ChatMessage } from '@/lib/types';
import { fmtTime } from '@/lib/format';

export default function ChatPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [disabled, setDisabled] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConvs = useCallback(() => {
    api.get<ChatConversation[]>('/chat/conversations')
      .then((c) => { setConvs(c); if (!activeId && c[0]) setActiveId(c[0].id); })
      .catch((e: any) => { if (e?.status === 403) setDisabled(true); });
  }, [activeId]);

  const loadMessages = useCallback((id: string) => {
    api.get<ChatMessage[]>(`/chat/conversations/${id}/messages`).then(setMessages).catch(() => {});
  }, []);

  useEffect(() => { loadConvs(); const t = setInterval(loadConvs, 6000); return () => clearInterval(t); }, [loadConvs]);
  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    const t = setInterval(() => loadMessages(activeId), 4000);
    return () => clearInterval(t);
  }, [activeId, loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    if (!draft.trim() || !activeId) return;
    const body = draft.trim();
    setDraft('');
    try {
      await api.post(`/chat/conversations/${activeId}/messages`, { body });
      loadMessages(activeId);
    } catch (e: any) { push(e?.message || 'Send failed.', 'error'); }
  }

  if (disabled) return <div className="empty">Chat is not enabled for this workspace.</div>;

  const active = convs.find((c) => c.id === activeId);

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 190px)', minHeight: 420, border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden', background: '#fff' }}>
      <div style={{ width: 260, borderRight: '1px solid var(--line)', overflowY: 'auto' }}>
        <div style={{ padding: '14px 16px', fontWeight: 600, fontSize: 13.5, borderBottom: '1px solid var(--line)' }}>Conversations</div>
        {convs.length === 0 ? <div className="empty" style={{ padding: 20 }}>No conversations yet.</div> : convs.map((c) => (
          <div key={c.id} onClick={() => setActiveId(c.id)}
            style={{ padding: '11px 16px', cursor: 'pointer', borderBottom: '1px solid #F2F1EC', background: c.id === activeId ? 'var(--teal-tint)' : undefined }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessage?.body ?? 'No messages yet'}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 14 }}>{active?.name ?? 'Select a conversation'}</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map((m) => {
            const out = m.senderId === user?.id;
            return (
              <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '65%' }}>
                <div style={{ padding: '9px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.5, background: out ? 'var(--teal)' : '#F1F0EB', color: out ? '#fff' : 'var(--ink)' }}>{m.body}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 3, textAlign: out ? 'right' : 'left' }}>
                  {out ? 'You' : m.sender?.fullName ?? '—'} · {fmtTime(m.createdAt)}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        {active ? (
          <div style={{ borderTop: '1px solid var(--line)', padding: '12px 16px', display: 'flex', gap: 10 }}>
            <input className="f-input" style={{ borderRadius: 100 }} value={draft} placeholder="Type a message…"
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
            <button className="btn btn-primary" onClick={send}>Send</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
