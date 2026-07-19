'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';

type Plan = 'FREE' | 'PRO' | 'ENTERPRISE';
interface Limits { maxUsers: number | null; maxResources: number | null; features: string[] }
interface Billing {
  plan: Plan; limits: Limits; usage: { users: number; resources: number };
  plans: Record<Plan, Limits>;
}

const ORDER: Plan[] = ['FREE', 'PRO', 'ENTERPRISE'];

function Bar({ used, max }: { used: number; max: number | null }) {
  const pct = max == null ? Math.min(100, used) : Math.min(100, (used / Math.max(1, max)) * 100);
  const over = max != null && used >= max;
  return (
    <div style={{ height: 8, background: '#F1F0EB', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--red)' : 'var(--teal)' }} />
    </div>
  );
}

export default function BillingPage() {
  const { push } = useToast();
  const [data, setData] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<Plan | null>(null);

  const load = useCallback(() => { api.get<Billing>('/admin/billing').then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  async function choose(plan: Plan) {
    setBusy(plan);
    try { await api.put('/admin/billing/plan', { plan }); push(`Switched to ${plan}.`, 'success'); load(); }
    catch (e: any) { push(e?.message || 'Failed.', 'error'); }
    finally { setBusy(null); }
  }

  if (!data) return <div className="empty">Loading…</div>;
  const lim = (n: number | null) => (n == null ? 'Unlimited' : n);

  return (
    <div>
      <div className="page-head"><h1>Billing &amp; plan</h1></div>
      <div className="info-box">Plan changes take effect immediately. Payment is in preview (mock) — real billing connects once the payment provider is configured.</div>

      <div className="grid grid-2" style={{ marginBottom: 22 }}>
        <div className="card">
          <div className="card-sub">Current plan</div>
          <div style={{ fontFamily: 'Space Grotesk', fontSize: 26, fontWeight: 700, margin: '2px 0 14px' }}>{data.plan}</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Users <span className="card-sub">· {data.usage.users} / {lim(data.limits.maxUsers)}</span></div>
          <Bar used={data.usage.users} max={data.limits.maxUsers} />
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>Resources <span className="card-sub">· {data.usage.resources} / {lim(data.limits.maxResources)}</span></div>
          <Bar used={data.usage.resources} max={data.limits.maxResources} />
        </div>
        <div className="card">
          <div className="card-sub">Included features</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {data.limits.features.map((f) => <span key={f} className="badge teal">{f}</span>)}
          </div>
        </div>
      </div>

      <div className="section-head"><h3>Choose a plan</h3></div>
      <div className="grid grid-3">
        {ORDER.map((p) => {
          const l = data.plans[p];
          const current = p === data.plan;
          return (
            <div key={p} className="card" style={{ borderColor: current ? 'var(--teal)' : undefined, borderWidth: current ? 2 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'Space Grotesk', fontSize: 18, fontWeight: 700 }}>{p}</div>
                {current ? <span className="badge green">Current</span> : null}
              </div>
              <ul style={{ listStyle: 'none', fontSize: 13, margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li>👥 {l.maxUsers == null ? 'Unlimited' : `Up to ${l.maxUsers}`} users</li>
                <li>🏢 {l.maxResources == null ? 'Unlimited' : `Up to ${l.maxResources}`} resources</li>
                <li>✨ {l.features.length} integrations</li>
              </ul>
              <button className={`btn ${current ? 'btn-ghost' : 'btn-primary'}`} style={{ width: '100%' }} disabled={current || busy === p} onClick={() => choose(p)}>
                {current ? 'Active' : busy === p ? <span className="spinner" /> : `Switch to ${p}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
