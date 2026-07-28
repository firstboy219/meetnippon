'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';

interface Contacts { builtBy: string; technical: string; policy: string }
type Category = 'technical' | 'policy' | 'suggestion';

/**
 * About the platform, and where to take a problem.
 *
 * The routing is the point: technical faults reach the team that can fix the
 * software, while anything about rules or approvals reaches the people who own
 * that decision. Sending both to one inbox is how reports get lost.
 */
export default function AboutPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const { user, branding } = useAuth();
  const path = usePathname();

  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [category, setCategory] = useState<Category>('technical');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    api.get<Contacts>('/feedback/contacts').then(setContacts).catch(() => setContacts(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const target = category === 'policy' ? contacts?.policy : contacts?.technical;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/feedback', {
        category,
        subject: subject.trim(),
        message: message.trim(),
        // Where they were when it happened — saves a round trip asking.
        page: path,
      });
      setSent(true);
      setSubject(''); setMessage('');
      push(t('about.sent'), 'success');
    } catch (err: any) {
      push(err?.message || t('about.fail'), 'error');
    } finally { setBusy(false); }
  }

  const appName = branding?.displayName || branding?.tenantName || 'MeetNippon';
  const cats: { key: Category; label: string; hint: string }[] = [
    { key: 'technical', label: t('about.cat_tech'), hint: t('about.cat_tech_hint') },
    { key: 'policy', label: t('about.cat_policy'), hint: t('about.cat_policy_hint') },
    { key: 'suggestion', label: t('about.cat_idea'), hint: t('about.cat_idea_hint') },
  ];

  return (
    <div className="about-grid">
      <div className="card">
        <div className="section-head"><h3>{t('about.title')}</h3></div>
        <p className="about-lead">{t('about.lead').replace('{app}', appName)}</p>

        <div className="about-row">
          <span className="about-key">{t('about.built_by')}</span>
          <span className="about-val"><strong>{contacts?.builtBy ?? '—'}</strong></span>
        </div>
        <div className="about-row">
          <span className="about-key">{t('about.workspace')}</span>
          <span className="about-val">{branding?.tenantName ?? '—'}</span>
        </div>
        <div className="about-row">
          <span className="about-key">{t('about.signed_in')}</span>
          <span className="about-val">{user?.email ?? '—'}</span>
        </div>

        <div className="section-head" style={{ marginTop: 22 }}><h3>{t('about.where_title')}</h3></div>
        <div className="about-contact">
          <div className="about-contact-head">{t('about.tech_title')}</div>
          <p>{t('about.tech_desc')}</p>
          {contacts?.technical ? (
            <a className="link" href={`mailto:${contacts.technical}`}>{contacts.technical}</a>
          ) : null}
        </div>
        <div className="about-contact">
          <div className="about-contact-head">{t('about.ga_title')}</div>
          <p>{t('about.ga_desc')}</p>
          {contacts?.policy ? (
            <a className="link" href={`mailto:${contacts.policy}`}>{contacts.policy}</a>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="section-head"><h3>{t('about.fb_title')}</h3></div>
        {sent ? (
          <div className="info-box">
            {t('about.sent_detail')}
            <div className="empty-action" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSent(false)}>
                {t('about.send_another')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="f-group">
              <label className="f-label">{t('about.category')}</label>
              <div className="cat-list">
                {cats.map((c) => (
                  <button type="button" key={c.key}
                    className={`cat-item ${category === c.key ? 'active' : ''}`}
                    aria-pressed={category === c.key}
                    onClick={() => setCategory(c.key)}>
                    <span className="cat-label">{c.label}</span>
                    <span className="cat-hint">{c.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Say plainly who will read it — no silent black hole. */}
            {target ? <div className="f-hint" style={{ marginBottom: 12 }}>{t('about.goes_to')} <strong>{target}</strong></div> : null}

            <div className="f-group">
              <label className="f-label">{t('about.subject')}</label>
              <input className="f-input" value={subject} maxLength={150} required minLength={3}
                onChange={(e) => setSubject(e.target.value)} placeholder={t('about.subject_ph')} />
            </div>
            <div className="f-group">
              <label className="f-label">{t('about.message')}</label>
              <textarea className="f-input" rows={7} value={message} maxLength={4000} required minLength={5}
                onChange={(e) => setMessage(e.target.value)} placeholder={t('about.message_ph')} />
              <div className="f-hint">{t('about.message_hint')}</div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? <span className="spinner" /> : t('about.send')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
