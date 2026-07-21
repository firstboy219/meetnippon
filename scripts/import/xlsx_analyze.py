#!/usr/bin/env python3
"""Summarise the booking workbook: rooms, people, divisions, dates, time formats."""
import sys, zipfile, re, datetime, collections, json
import xml.etree.ElementTree as ET

NS = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'pr': 'http://schemas.openxmlformats.org/package/2006/relationships',
}
z = zipfile.ZipFile(sys.argv[1])

shared = []
if 'xl/sharedStrings.xml' in z.namelist():
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in root.findall('m:si', NS):
        shared.append(''.join(t.text or '' for t in si.iter(f"{{{NS['m']}}}t")))

rels = {}
for rel in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')).findall('pr:Relationship', NS):
    rels[rel.get('Id')] = rel.get('Target')

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

def serial_to_date(s):
    try: n = float(s)
    except ValueError: return None
    if n < 20000 or n > 60000: return None
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(n))).isoformat()

SKIP = {'Template', 'Sheet1'}
people = collections.Counter()
divisions = collections.Counter()
name_div = collections.defaultdict(collections.Counter)
timefmt = collections.Counter()
per_room = {}
all_dates = []
rows_total = 0

for name, target in sheets:
    if name in SKIP: continue
    root = ET.fromstring(z.read(target))
    sd = root.find('m:sheetData', NS)
    if sd is None: continue
    n = 0
    dates = []
    for row in sd.findall('m:row', NS):
        cells = {col_of(c.get('r')): txt(c) for c in row.findall('m:c', NS)}
        who, div = cells.get('B', '').strip(), cells.get('C', '').strip()
        d = serial_to_date(cells.get('E', ''))
        tm = cells.get('F', '').strip()
        # a data row has a person and a date
        if not who or who.lower() == 'name' or not d: continue
        n += 1; rows_total += 1
        people[who] += 1
        if div: divisions[div] += 1; name_div[who][div] += 1
        dates.append(d); all_dates.append(d)
        if tm:
            u = tm.upper()
            if 'FULL' in u: timefmt['FULL DAY'] += 1
            elif 'SELESAI' in u: timefmt['open-ended (SELESAI)'] += 1
            elif re.match(r'^\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}$', tm): timefmt['HH.MM-HH.MM'] += 1
            else: timefmt[f'other: {tm[:22]}'] += 1
        else:
            timefmt['(blank)'] += 1
    per_room[name] = {'rows': n, 'first': min(dates) if dates else None, 'last': max(dates) if dates else None}

print("== ROOMS (sheet names) ==")
for r, v in per_room.items():
    print(f"  {r:<20} rows={v['rows']:<5} {v['first']} .. {v['last']}")
print(f"\n  total booking rows: {rows_total}")
print(f"  date range overall: {min(all_dates)} .. {max(all_dates)}")

print(f"\n== DIVISIONS ({len(divisions)}) ==")
for d, c in divisions.most_common():
    print(f"  {d:<24} {c}")

print(f"\n== PEOPLE ({len(people)}) ==")
for p, c in people.most_common(40):
    divs = ','.join(d for d, _ in name_div[p].most_common(2))
    print(f"  {p:<22} {c:<5} [{divs}]")
if len(people) > 40: print(f"  ... and {len(people)-40} more")

print(f"\n== TIME FORMATS ==")
for f, c in timefmt.most_common(15):
    print(f"  {f:<32} {c}")

today = datetime.date.today().isoformat()
future = [d for d in all_dates if d >= today]
print(f"\n== TODAY {today}: {len(future)} rows are today or later, {len(all_dates)-len(future)} are in the past")
