#!/usr/bin/env python3
"""
Build the SQL to import the workbook's still-upcoming bookings.

Written as direct inserts rather than API calls on purpose: the booking rules
(max 4h duration, max 60 days ahead) exist to govern what staff may book from
the portal, and would reject most of these perfectly legitimate rows. A data
migration is not a user action.

What is NOT bypassed: conflicts are detected and reported, because a room
double-booked in the sheet would otherwise show as double-booked in the app.
"""
import sys, zipfile, re, datetime, json, collections
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'pr': 'http://schemas.openxmlformats.org/package/2006/relationships'}
SKIP_SHEETS = {'Template', 'Sheet1'}
FULL_DAY = ('08:00', '16:30')      # owner's choice
OPEN_END = '16:30'
TZ_OFFSET = datetime.timedelta(hours=7)   # Asia/Jakarta, no DST

xlsx, today, tenant_id, admin_id = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
rooms = json.loads(sys.argv[5])            # {name_lower: resourceId}

z = zipfile.ZipFile(xlsx)
shared = []
if 'xl/sharedStrings.xml' in z.namelist():
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
        shared.append(''.join(t.text or '' for t in si.iter(f"{{{NS['m']}}}t")))
rels = {r.get('Id'): r.get('Target')
        for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')).findall('pr:Relationship', NS)}
sheets = []
for sh in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', NS).findall('m:sheet', NS):
    t = rels.get(sh.get(f"{{{NS['r']}}}id"), '')
    sheets.append((sh.get('name'), 'xl/' + t.lstrip('./') if not t.startswith('/') else t))

def col_of(ref): return re.match(r'[A-Z]+', ref or 'A').group(0)
def txt(c):
    t = c.get('t')
    if t == 'inlineStr': return ''.join(x.text or '' for x in c.iter(f"{{{NS['m']}}}t"))
    v = c.find('m:v', NS)
    if v is None or v.text is None: return ''
    if t == 's':
        i = int(v.text); return shared[i] if i < len(shared) else ''
    return v.text
def to_date(s):
    try: n = float(s)
    except (ValueError, TypeError): return None
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(n))).isoformat() if 20000 < n < 60000 else None

def norm_time(v):
    if not v: return (*FULL_DAY, 'blank -> full day')
    s = v.strip(); u = s.upper()
    if 'FULL' in u or u.replace(' ', '') in ('FULDAY', 'FULLDAY'): return (*FULL_DAY, None)
    nums = re.findall(r'(\d{1,2})\s*[.:,]\s*(\d{1,3})', s)
    open_ended = any(k in u for k in ('SELESAI', 'SELESAU', 'END', 'DONE'))
    def fix(h, m):
        h = int(h); m = m[:2] if len(m) > 2 else m
        m = int(m.ljust(2, '0'))
        return f'{min(h,23):02d}:{(m if m < 60 else 0):02d}'
    if len(nums) >= 2 and not open_ended: return fix(*nums[0]), fix(*nums[1]), None
    if len(nums) == 1:
        st = fix(*nums[0])
        return st, OPEN_END, ('open-ended -> 16:30' if open_ended else f'one time {s!r} -> 16:30')
    return (*FULL_DAY, f'unparsed {s!r} -> full day')

def utc(date, hhmm):
    h, m = map(int, hhmm.split(':'))
    local = datetime.datetime.fromisoformat(date).replace(hour=h, minute=m)
    return local - TZ_OFFSET

rows, notes, skipped = [], collections.Counter(), collections.Counter()
for sheet, target in sheets:
    if sheet in SKIP_SHEETS: continue
    sd = ET.fromstring(z.read(target)).find('m:sheetData', NS)
    if sd is None: continue
    rid = rooms.get(sheet.strip().lower())
    if not rid:
        skipped[f'no room for sheet {sheet!r}'] += 1
        continue
    for row in sd.findall('m:row', NS):
        c = {col_of(x.get('r')): txt(x) for x in row.findall('m:c', NS)}
        who, div = c.get('B', '').strip(), c.get('C', '').strip()
        date, tm, rem = to_date(c.get('E', '')), c.get('F', '').strip(), c.get('G', '').strip()
        if not who or who.lower() == 'name' or not date or date < today:
            if date and date < today: skipped['past'] += 1
            continue
        st, en, note = norm_time(tm)
        if st >= en:
            skipped[f'end<=start {tm!r}'] += 1; continue
        if note: notes[note] += 1
        # The owner asked for the person's name to live in the title, since
        # every booking is owned by the admin account.
        who_label = f"{who} ({div})" if div else who
        title = f"{rem} — {who_label}" if rem else f"Meeting — {who_label}"
        rows.append({'room': sheet, 'rid': rid, 'who': who, 'div': div, 'date': date,
                     'st': st, 'en': en, 'title': title[:180], 'raw': tm,
                     'start': utc(date, st), 'end': utc(date, en)})

rows.sort(key=lambda r: (r['start'], r['room']))

# overlaps inside the import, per room
conflicts = []
by_room = collections.defaultdict(list)
for r in rows: by_room[r['room']].append(r)
for room, rs in by_room.items():
    rs.sort(key=lambda x: x['start'])
    for a, b in zip(rs, rs[1:]):
        if b['start'] < a['end']:
            conflicts.append((room, a, b))

e = sys.stderr
print(f"rows to import : {len(rows)}", file=e)
print(f"skipped        : {dict(skipped)}", file=e)
print(f"time notes     : {dict(notes)}", file=e)
print(f"overlaps found : {len(conflicts)}", file=e)
for room, a, b in conflicts[:12]:
    print(f"  {room}: {a['date']} {a['st']}-{a['en']} ({a['who']})  vs  {b['st']}-{b['en']} ({b['who']})", file=e)
if len(conflicts) > 12: print(f"  ... {len(conflicts)-12} more", file=e)

def q(s): return "'" + s.replace("'", "''") + "'"
out = ["BEGIN;"]
for i, r in enumerate(rows):
    bid = f"imp-npc-{r['start'].strftime('%Y%m%d%H%M')}-{i:04d}"
    desc = f"Imported from PT NPC booking sheet — {r['room']} — requested by {r['who']}" + (f" ({r['div']})" if r['div'] else "")
    out.append(
        "INSERT INTO \"Booking\" (id,\"tenantId\",title,description,type,\"resourceId\","
        "\"principalId\",\"bookerId\",\"startTime\",\"endTime\",status,participants,reminders,"
        "\"recordingRequested\",\"createdAt\",\"updatedAt\") VALUES ("
        f"{q(bid)},{q(tenant_id)},{q(r['title'])},{q(desc)},'OFFLINE',{q(r['rid'])},"
        f"{q(admin_id)},{q(admin_id)},"
        f"'{r['start'].strftime('%Y-%m-%d %H:%M:%S')}','{r['end'].strftime('%Y-%m-%d %H:%M:%S')}',"
        "'APPROVED','[]','[]',false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING;")
out.append("COMMIT;")
print('\n'.join(out))
