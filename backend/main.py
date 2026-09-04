from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3, os, calendar, hashlib, secrets, smtplib, ssl
from contextvars import ContextVar
from email.message import EmailMessage
from datetime import date, datetime, timedelta
import json
import urllib.request
import urllib.error

DB = os.path.join(os.path.dirname(__file__), "student_finance.db")
active_profile_id = ContextVar('active_profile_id', default=None)

def load_env_file():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding='utf-8') as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"\''))

load_env_file()
app = FastAPI(title="Pennywise Student Finance API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def conn():
    c=sqlite3.connect(DB)
    c.row_factory=sqlite3.Row
    c.create_function('active_user_id', 0, lambda: active_profile_id.get() or (_ for _ in ()).throw(sqlite3.OperationalError('Active user session required')))
    return c
def rows(c): return [dict(x) for x in c.fetchall()]
def init():
 c=conn(); c.executescript('''
 CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, student_type TEXT, currency TEXT DEFAULT 'INR', income_source TEXT, monthly_income REAL DEFAULT 0, rent REAL DEFAULT 0, tuition REAL DEFAULT 0, onboarded INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS auth_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password_hash TEXT, otp_hash TEXT, otp_expires_at TEXT, verified INTEGER DEFAULT 0, created_at TEXT);
 CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, color TEXT, UNIQUE(user_id,name));
 CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,description TEXT,amount REAL,date TEXT,type TEXT,category TEXT);
 CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,month TEXT,income REAL DEFAULT 0,spending_limit REAL DEFAULT 0,savings_target REAL DEFAULT 0, UNIQUE(user_id,month));
 CREATE TABLE IF NOT EXISTS category_budgets (id INTEGER PRIMARY KEY AUTOINCREMENT,budget_id INTEGER,category TEXT,amount REAL, UNIQUE(budget_id,category));
 CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,message TEXT,level TEXT,read INTEGER DEFAULT 0,key TEXT,created_at TEXT, UNIQUE(user_id,key));
 CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,target REAL,current REAL DEFAULT 0,target_date TEXT);
 CREATE TABLE IF NOT EXISTS planned_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,description TEXT,amount REAL,category TEXT,expected_date TEXT,reminder_time TEXT DEFAULT '09:00',reminder_offset TEXT DEFAULT '1 day before',recurrence TEXT DEFAULT 'None',payment_status TEXT DEFAULT 'pending');
 ''');
 for column,definition in [('reminder_time',"TEXT DEFAULT '09:00'"),('reminder_offset',"TEXT DEFAULT '1 day before'"),('recurrence',"TEXT DEFAULT 'None'"),('payment_status',"TEXT DEFAULT 'pending'")]:
  try: c.execute(f'ALTER TABLE planned_expenses ADD COLUMN {column} {definition}')
  except sqlite3.OperationalError: pass
 c.execute("INSERT OR IGNORE INTO users(id,name,email,onboarded) VALUES(1,'','','0')"); c.commit(); c.close()
init()

@app.middleware('http')
async def resolve_user(request: Request, call_next):
    token = active_profile_id.set(None)
    email = request.headers.get('X-User-Email', '').strip().lower()
    if email:
        c = conn()
        row = c.execute('SELECT u.id FROM users u JOIN auth_users a ON lower(a.email)=lower(u.email) WHERE lower(a.email)=? AND a.verified=1', (email,)).fetchone()
        c.close()
        if row:
            active_profile_id.set(row['id'])
    auth_public = request.url.path in ('/api/auth/signup', '/api/auth/resend', '/api/auth/verify', '/api/auth/login', '/api/auth/status')
    if not auth_public and not email:
        active_profile_id.reset(token)
        raise HTTPException(401, 'An active verified account is required.')
    try:
        return await call_next(request)
    finally:
        active_profile_id.reset(token)

def require_active_profile():
    profile_id = active_profile_id.get()
    if profile_id is None:
        raise HTTPException(401, 'An active verified account is required.')
    return profile_id

def ensure_profile(c, auth_row):
    email = auth_row['email'].strip().lower()
    profile = c.execute('SELECT * FROM users WHERE lower(email)=?', (email,)).fetchone()
    if profile:
        return profile['id']
    empty = c.execute("SELECT id FROM users WHERE COALESCE(email,'')='' ORDER BY id LIMIT 1").fetchone()
    if empty:
        c.execute('UPDATE users SET name=?, email=? WHERE id=?', (auth_row['name'] or '', email, empty['id']))
        return empty['id']
    c.execute("INSERT INTO users(name,email,student_type,currency,income_source,monthly_income,rent,tuition,onboarded) VALUES(?,?,NULL,'INR',NULL,0,0,0,0)", (auth_row['name'] or '', email))
    return c.execute('SELECT last_insert_rowid()').fetchone()[0]
COLORS=['#AA81BD','#7E9AD3','#E29B79','#78B99A','#D187A4','#D2A855','#8492A6','#B587C9']
DEFAULTS=['Books & Supplies','Shopping','Food','Bills','Fun','Travel','Tuitions','Others']

def hash_secret(value:str):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

def mask_email(email:str):
    if '@' not in email: return email
    local, domain = email.split('@',1)
    return f"{local[:2]}***@{domain}"

def send_otp_email(recipient: str, otp: str):
    api_key = os.getenv('RESEND_API_KEY')
    sender = os.getenv(
        'RESEND_FROM',
        'ClockItPocket <onboarding@resend.dev>'
    )

    if not api_key:
        raise RuntimeError('RESEND_API_KEY is not configured.')

    payload = {
        'from': sender,
        'to': [recipient],
        'subject': 'Your ClockItPocket verification code',
        'text': (
            f'Your ClockItPocket verification code is {otp}.\n\n'
            'This code expires in 5 minutes. '
            'If you did not request it, ignore this email.'
        )
    }

    data = json.dumps(payload).encode('utf-8')

    request = urllib.request.Request(
        'https://api.resend.com/emails',
        data=data,
        method='POST',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'ClockItPocket/1.0'
        }
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response_data = response.read().decode('utf-8')
            return {
                'ok': True,
                'response': response_data
            }
    except urllib.error.HTTPError as error:
        error_body = error.read().decode('utf-8', errors='replace')
        raise RuntimeError(
            f'Resend API error {error.code}: {error_body}'
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(
            f'Resend connection error: {error.reason}'
        ) from error

    if not password:
        print(f'OTP demo mode: using Gmail sender {sender} for {recipient} | code: {otp}')
        return {'demo': True, 'otp': otp}

    message=EmailMessage()
    message['Subject']='Your ClockItPocket verification code'
    message['From']=sender
    message['To']=recipient
    message.set_content(f'Your ClockItPocket verification code is {otp}.\n\nThis code expires in 5 minutes. If you did not request it, ignore this email.')
    context=ssl.create_default_context()
    if port==465:
        with smtplib.SMTP_SSL(host,port,context=context,timeout=15) as server:
            server.login(username,password)
            server.send_message(message)
    else:
        with smtplib.SMTP(host,port,timeout=15) as server:
            server.starttls(context=context)
            server.login(username,password)
            server.send_message(message)
    return {'demo': False, 'otp': otp}

def month(): return date.today().strftime('%Y-%m')
def scalar(c,q,args=()):
 r=c.execute(q,args).fetchone(); return r[0] if r else 0
def budget(c,m=None):
 require_active_profile(); m=m or month(); u=c.execute('SELECT * FROM users WHERE id=active_user_id()').fetchone(); c.execute('INSERT OR IGNORE INTO budgets(user_id,month,income,spending_limit,savings_target) VALUES(active_user_id(),?,?,?,0)',(m,u['monthly_income'],u['monthly_income'])); c.commit(); return c.execute('SELECT * FROM budgets WHERE user_id=active_user_id() AND month=?',(m,)).fetchone()
def notify(c):
 b=budget(c); spent=scalar(c,"SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=active_user_id() AND type='expense' AND substr(date,1,7)=?",(month(),)); checks=[]
 if b['spending_limit']>0:
  for pct in (80,90,100):
   if spent>=b['spending_limit']*pct/100: checks.append((f'overall-{month()}-{pct}',f"You've used {pct}% of your monthly budget.",'warning' if pct<100 else 'danger'))
 for x in rows(c.execute('SELECT * FROM category_budgets WHERE budget_id=?',(b['id'],))):
    s=scalar(c,"SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=active_user_id() AND type='expense' AND category=? AND substr(date,1,7)=?",(x['category'],month()))
    for pct in (80,90,100):
     if x['amount'] and s>=x['amount']*pct/100: checks.append((f"cat-{month()}-{x['category']}-{pct}",f"You've used {pct}% of your {x['category']} budget.",'warning' if pct<100 else 'danger'))
 for key,msg,lvl in checks: c.execute('INSERT OR IGNORE INTO notifications(user_id,message,level,key,created_at) VALUES(active_user_id(),?,?,?,?)',(msg,lvl,key,datetime.now().isoformat()))
 c.commit()
def notify_planned(c):
 now=datetime.now(); offsets={'At the exact time':0,'1 hour before':3600,'1 day before':86400,'3 days before':259200,'1 week before':604800}
 for item in rows(c.execute("SELECT * FROM planned_expenses WHERE user_id=active_user_id() AND payment_status!='paid' AND expected_date>=?",(date.today().isoformat(),))):
    due=datetime.strptime(f"{item['expected_date']} {item['reminder_time'] or '09:00'}",'%Y-%m-%d %H:%M'); reminder=due-timedelta(seconds=offsets.get(item['reminder_offset'],86400))
    if now>=reminder:
     key=f"planned-{item['id']}-{item['expected_date']}-{item['reminder_offset']}"; message=f"{item['description']} - {item['amount']:.2f} is due {('today' if item['expected_date']==date.today().isoformat() else 'soon')}."
     c.execute('INSERT OR IGNORE INTO notifications(user_id,message,level,key,created_at) VALUES(active_user_id(),?,?,?,?)',(message,'info',key,now.isoformat()))
 c.commit()
class Data(BaseModel):
 data: dict

@app.post('/api/auth/signup')
def auth_signup(body:Data):
    d = body.data
    name = str(d.get('name','')).strip()
    email = str(d.get('email','')).strip().lower()
    password = str(d.get('password',''))
    if not name or not email or not password:
        raise HTTPException(400, 'Name, email and password are required.')
    if '@' not in email:
        raise HTTPException(400, 'Enter a valid email address.')
    if len(password) < 8:
        raise HTTPException(400, 'Password must be at least 8 characters long.')
    c = conn()
    existing = c.execute('SELECT id, verified FROM auth_users WHERE email = ?', (email,)).fetchone()
    if existing is not None:
        c.close()
        raise HTTPException(409, 'An account using this email address already exists. Please try logging in instead.')
    otp = ''.join(str(secrets.randbelow(10)) for _ in range(6))
    otp_hash = hash_secret(otp)
    expires = (datetime.now() + timedelta(minutes=5)).isoformat()
    c.execute('''
        INSERT INTO auth_users(name,email,password_hash,otp_hash,otp_expires_at,verified,created_at)
        VALUES(?,?,?,?,?,?,?)
    ''', (name, email, hash_secret(password), otp_hash, expires, 0, datetime.now().isoformat()))
    try:
        email_result = send_otp_email(email, otp)
    except (OSError, ValueError, smtplib.SMTPException, RuntimeError) as error:
        c.rollback(); c.close()
        raise HTTPException(503, 'We could not send the verification email. Please try again later.') from error
    c.commit(); c.close()
    return {'ok': True, 'masked_email': mask_email(email)}

@app.post('/api/auth/resend')
def auth_resend(body:Data):
    email = str(body.data.get('email','')).strip().lower()
    if not email:
        raise HTTPException(400, 'Email is required.')
    c = conn()
    row = c.execute('SELECT * FROM auth_users WHERE email=?', (email,)).fetchone()
    if not row:
        c.close()
        raise HTTPException(404, 'Account not found.')
    if row['verified'] == 1:
        c.close()
        raise HTTPException(409, 'An account using this email address already exists. Please try logging in instead.')
    otp = ''.join(str(secrets.randbelow(10)) for _ in range(6))
    expires = (datetime.now() + timedelta(minutes=5)).isoformat()
    c.execute('UPDATE auth_users SET otp_hash=?, otp_expires_at=? WHERE id=?', (hash_secret(otp), expires, row['id']))
    try:
        email_result = send_otp_email(email, otp)
    except (OSError, ValueError, smtplib.SMTPException, RuntimeError) as error:
        c.rollback(); c.close()
        raise HTTPException(503, 'We could not send the verification email. Please try again later.') from error
    c.commit(); c.close()
    return {'ok': True, 'masked_email': mask_email(email)}

@app.post('/api/auth/verify')
def auth_verify(body:Data):
    email = str(body.data.get('email','')).strip().lower()
    otp = str(body.data.get('otp','')).strip()
    if not email or not otp:
        raise HTTPException(400, 'Email and OTP are required.')
    c = conn(); row = c.execute('SELECT * FROM auth_users WHERE email=?', (email,)).fetchone()
    if not row:
        c.close(); raise HTTPException(404, 'Account not found.')
    if row['verified'] == 1:
        ensure_profile(c, row); c.commit(); c.close(); return {'ok': True, 'already_verified': True, 'email': row['email']}
    if row['otp_expires_at'] is None or datetime.now() > datetime.fromisoformat(row['otp_expires_at']):
        c.close(); raise HTTPException(401, 'OTP expired. Please request a new one.')
    if hash_secret(otp) != row['otp_hash']:
        c.close(); raise HTTPException(401, 'Incorrect OTP. Please try again.')
    profile_id = ensure_profile(c, row)
    c.execute('UPDATE auth_users SET verified=1, otp_hash=NULL, otp_expires_at=NULL WHERE id=?', (row['id'],))
    c.execute('UPDATE users SET email=?, name=? WHERE id=?', (row['email'], row['name'] or '', profile_id))
    c.commit(); c.close();
    return {'ok': True, 'verified': True, 'email': row['email']}

@app.post('/api/auth/signout')
def auth_signout():
    profile_id = require_active_profile(); c=conn(); c.execute('UPDATE users SET onboarded=0 WHERE id=?',(profile_id,)); c.commit(); c.close()
    return {'ok':True}

@app.get('/api/auth/status')
def auth_status():
    c = conn()
    current = c.execute('SELECT email FROM users WHERE id=active_user_id()').fetchone() if active_profile_id.get() else None
    email = (current['email'] or '').strip().lower() if current else ''
    verified = bool(email and c.execute('SELECT 1 FROM auth_users WHERE email=? AND verified=1', (email,)).fetchone())
    c.close()
    return {'verified': verified}

@app.delete('/api/auth/account')
def delete_account():
    profile_id = require_active_profile()
    c = conn()
    try:
        current = c.execute('SELECT email FROM users WHERE id=?',(profile_id,)).fetchone()
        email = (current['email'] or '').strip().lower() if current else ''
        if email:
            c.execute('DELETE FROM auth_users WHERE lower(trim(email))=?', (email,))
        c.execute('DELETE FROM category_budgets WHERE budget_id IN (SELECT id FROM budgets WHERE user_id=?)',(profile_id,))
        for table in ('categories', 'transactions', 'budgets', 'notifications', 'goals', 'planned_expenses'):
            c.execute(f'DELETE FROM {table} WHERE user_id=?',(profile_id,))
        c.execute('DELETE FROM users WHERE id=?',(profile_id,))
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()
    return {'ok':True}

@app.post('/api/auth/login')
def auth_login(body:Data):
    email=str(body.data.get('email','')).strip().lower()
    password=str(body.data.get('password',''))
    if not email or not password:
        raise HTTPException(400,'Email and password are required.')
    c=conn(); row=c.execute('SELECT * FROM auth_users WHERE email=?',(email,)).fetchone()
    if not row:
        c.close(); raise HTTPException(401,'No account was found for this email address.')
    if row['verified'] != 1:
        c.close(); raise HTTPException(403,'Please verify your email with the OTP before logging in.')
    if hash_secret(password) != row['password_hash']:
        c.close(); raise HTTPException(401,'The password is incorrect. Please check it and try again.')
    profile_id = ensure_profile(c, row)
    c.execute('UPDATE users SET email=?, name=?, onboarded=1 WHERE id=?',(row['email'],row['name'],profile_id))
    c.commit(); c.close()
    return {'ok':True,'email':row['email']}

@app.get('/api/profile')
def profile():
 require_active_profile(); c=conn(); r=dict(c.execute('SELECT * FROM users WHERE id=active_user_id()').fetchone()); c.close(); return r
@app.put('/api/profile')
def put_profile(body:Data):
 allowed=['name','student_type','currency','income_source','monthly_income','rent','tuition','onboarded']; d={k:v for k,v in body.data.items() if k in allowed}; require_active_profile(); c=conn(); c.execute('UPDATE users SET '+','.join(f'{k}=?' for k in d)+' WHERE id=active_user_id()',list(d.values()))
 if 'monthly_income' in d:
    c.execute('UPDATE budgets SET income=? WHERE user_id=active_user_id() AND month=?',(float(d['monthly_income']),month()))
 c.commit(); c.close(); return {'ok':True}
@app.get('/api/categories')
def categories():
 require_active_profile(); c=conn();
 legacy=['Groceries','Rent/Hostel','Transport','Education','Tuition','Health','Phone/Internet','Entertainment','Clothing','Eating Out','Subscriptions','Gaming','Social Activities','Savings','Other']
 c.executemany('DELETE FROM categories WHERE user_id=active_user_id() AND name=?',[(n,) for n in legacy])
 for i,n in enumerate(DEFAULTS): c.execute('INSERT OR IGNORE INTO categories(user_id,name,color) VALUES(active_user_id(),?,?)',(n,COLORS[i%len(COLORS)]))
 c.commit(); r=rows(c.execute('SELECT * FROM categories WHERE user_id=active_user_id() ORDER BY name'));c.close();return r
@app.post('/api/categories')
def category(body:Data):
 d=body.data; require_active_profile(); c=conn();c.execute('INSERT OR IGNORE INTO categories(user_id,name,color) VALUES(active_user_id(),?,?)',(d['name'],d.get('color',COLORS[0])));c.commit();c.close();return {'ok':True}
@app.get('/api/transactions')
def transactions(q:str='',category:str='',kind:str='',start:str='',end:str='',sort:str='date_desc'):
 require_active_profile(); c=conn(); sql='SELECT * FROM transactions WHERE user_id=active_user_id()'; a=[]
 for clause,val in [(" AND description LIKE ?",'%'+q+'%' if q else None),(" AND category=?",category or None),(" AND type=?",kind or None),(" AND date>=?",start or None),(" AND date<=?",end or None)]:
  if val is not None: sql+=clause;a.append(val)
 order={'date_asc':'date ASC','amount_desc':'amount DESC','amount_asc':'amount ASC'}.get(sort,'date DESC,id DESC'); r=rows(c.execute(sql+' ORDER BY '+order,a)); balance=0
 allx=rows(c.execute('SELECT * FROM transactions WHERE user_id=active_user_id() ORDER BY date,id'))
 balances={x['id']:0 for x in allx}
 for x in allx: balance += x['amount'] if x['type']=='income' else -x['amount']; balances[x['id']]=balance
 for x in r:x['balance_after']=balances[x['id']]
 c.close();return r
@app.post('/api/transactions')
def add_tx(body:Data):
 d=body.data;require_active_profile();c=conn();c.execute('INSERT INTO transactions(user_id,description,amount,date,type,category) VALUES(active_user_id(),?,?,?,?,?)',(d['description'],float(d['amount']),d['date'],d['type'],d['category']));notify(c);c.close();return {'ok':True}
@app.put('/api/transactions/{i}')
def edit_tx(i:int,body:Data):
 d=body.data;require_active_profile();c=conn();c.execute('UPDATE transactions SET description=?,amount=?,date=?,type=?,category=? WHERE id=? AND user_id=active_user_id()',(d['description'],float(d['amount']),d['date'],d['type'],d['category'],i));notify(c);c.close();return {'ok':True}
@app.delete('/api/transactions/{i}')
def del_tx(i:int): require_active_profile(); c=conn();c.execute('DELETE FROM transactions WHERE id=? AND user_id=active_user_id()',(i,));notify(c);c.close();return {'ok':True}
@app.get('/api/budget')
def get_budget():
 c=conn();b=dict(budget(c));b['categories']=rows(c.execute('SELECT category,amount FROM category_budgets WHERE budget_id=?',(b['id'],)));c.close();return b

@app.get('/api/trends')
def trends(period:str=Query('monthly', alias='range')):
 today=date.today()
 if period=='weekly':
  dates=[today-timedelta(days=i) for i in range(6,-1,-1)]; labels=[x.strftime('%a') for x in dates]; keys=[x.isoformat() for x in dates]
 elif period=='yearly':
  keys=[]
  for offset in range(11,-1,-1):
   year=today.year; month=today.month-offset
   while month<=0: year-=1; month+=12
   keys.append(f'{year:04d}-{month:02d}')
  labels=[datetime.strptime(x,'%Y-%m').strftime('%b') for x in keys]
 else:
  keys=[]
  for offset in range(5,-1,-1):
   year=today.year; month=today.month-offset
   while month<=0: year-=1; month+=12
   keys.append(f'{year:04d}-{month:02d}')
  labels=[datetime.strptime(x,'%Y-%m').strftime('%b') for x in keys]
 start=keys[0]; end=keys[-1]+'-31' if period!='weekly' else keys[-1]
 require_active_profile(); c=conn(); transactions=rows(c.execute("SELECT category,date,amount FROM transactions WHERE user_id=active_user_id() AND type='expense' AND date>=? AND date<=?",(start,end)));c.close()
 categories=[]; grouped={}
 for item in transactions:
  category=item['category']; key=item['date'] if period=='weekly' else item['date'][:7]
  if category not in categories: categories.append(category)
  grouped[(category,key)]=grouped.get((category,key),0)+item['amount']
 return {'labels':labels,'series':[{'category':category,'values':[grouped.get((category,key),0) for key in keys]} for category in categories]}

@app.get('/api/heatmap')
def spending_heatmap():
 today=date.today(); first=today.replace(day=1); days=calendar.monthrange(today.year,today.month)[1]
 require_active_profile(); c=conn(); records=rows(c.execute("SELECT date,SUM(amount) amount FROM transactions WHERE user_id=active_user_id() AND type='expense' AND date>=? AND date<=? GROUP BY date",(first.isoformat(),today.replace(day=days).isoformat())));c.close()
 amounts={item['date']:item['amount'] for item in records}
 values=[{'date':(first+timedelta(days=i)).isoformat(),'amount':amounts.get((first+timedelta(days=i)).isoformat(),0)} for i in range(days)]
 return {'month':first.strftime('%B %Y'),'start_weekday':first.weekday(),'days':values}

@app.get('/api/trend-comparison')
def trend_comparison(period:str=Query('monthly', alias='range')):
 today=date.today()
 if period=='weekly':
  current_start=today-timedelta(days=today.weekday()); current_end=current_start+timedelta(days=6); previous_start=current_start-timedelta(days=7); previous_end=current_start-timedelta(days=1); label='This week vs last week'
 elif period=='yearly':
  current_start=today.replace(month=1,day=1); current_end=today.replace(month=12,day=31); previous_start=current_start.replace(year=today.year-1); previous_end=previous_start.replace(year=today.year-1,month=12,day=31); label='This year vs last year'
 else:
  current_start=today.replace(day=1); previous_end=current_start-timedelta(days=1); previous_start=previous_end.replace(day=1); current_end=today; label='This month vs last month'
 require_active_profile(); c=conn(); records=rows(c.execute("SELECT category,date,SUM(amount) amount FROM transactions WHERE user_id=active_user_id() AND type='expense' AND date>=? AND date<=? GROUP BY category,date",(previous_start.isoformat(),current_end.isoformat())));c.close()
 current={}; previous={}
 for item in records:
  target=current if current_start.isoformat()<=item['date']<=current_end.isoformat() else previous
  target[item['category']]=target.get(item['category'],0)+item['amount']
 categories=sorted(set(current)|set(previous),key=lambda category:current.get(category,0),reverse=True)
 result=[]
 for category in categories:
  old=previous.get(category,0); new=current.get(category,0); change=100 if old==0 and new else ((new-old)/old*100 if old else 0)
  result.append({'category':category,'current':new,'previous':old,'change':round(change)})
 return {'label':label,'items':result}

@app.put('/api/budget')
def put_budget(body:Data):
 d=body.data;c=conn(); b=budget(c,d.get('month'));c.execute('UPDATE budgets SET income=?,spending_limit=?,savings_target=? WHERE id=?',(float(d.get('income',0)),float(d.get('spending_limit',0)),float(d.get('savings_target',0)),b['id']));c.execute('DELETE FROM category_budgets WHERE budget_id=?',(b['id'],));c.executemany('INSERT INTO category_budgets(budget_id,category,amount) VALUES(?,?,?)',[(b['id'],x['category'],float(x['amount'])) for x in d.get('categories',[])]);notify(c);c.close();return {'ok':True}
@app.get('/api/dashboard')
def dashboard():
 require_active_profile(); c=conn();b=dict(budget(c));m=month(); exp=scalar(c,"SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=active_user_id() AND type='expense' AND substr(date,1,7)=?",(m,)); inc=scalar(c,"SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=active_user_id() AND type='income' AND substr(date,1,7)=?",(m,)); balance=inc-scalar(c,"SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=active_user_id() AND type='expense'",()); days=calendar.monthrange(date.today().year,date.today().month)[1]-date.today().day; cats=rows(c.execute("SELECT category,SUM(amount) amount FROM transactions WHERE user_id=active_user_id() AND type='expense' AND substr(date,1,7)=? GROUP BY category ORDER BY amount DESC",(m,))); recent=rows(c.execute('SELECT * FROM transactions WHERE user_id=active_user_id() ORDER BY date DESC,id DESC LIMIT 5')); planned=rows(c.execute("SELECT * FROM planned_expenses WHERE user_id=active_user_id() AND payment_status!='paid' AND expected_date>=? ORDER BY expected_date LIMIT 5",(date.today().isoformat(),))); upcoming_total=scalar(c,"SELECT COALESCE(SUM(amount),0) FROM planned_expenses WHERE user_id=active_user_id() AND payment_status!='paid' AND expected_date>=?",(date.today().isoformat(),)); rate=exp/max(date.today().day,1); projected=rate*calendar.monthrange(date.today().year,date.today().month)[1]; limit=b['spending_limit']; health='On track' if not limit or exp<limit*.7 else ('Approaching budget' if exp<limit*.9 else ('At risk of running out of money' if projected>limit else 'Spending too quickly'))
 left=max(0,limit-exp); available=b['income']-exp+inc; forecast=left-upcoming_total
 notify(c);notify_planned(c);unread=scalar(c,'SELECT COUNT(*) FROM notifications WHERE user_id=active_user_id() AND read=0');c.close();return {'available':available,'spent':exp,'left':left,'days':days,'budget':b,'categories':cats,'recent':recent,'planned':planned,'upcoming_total':upcoming_total,'forecast_balance':forecast,'health':health,'daily_rate':rate,'projected':projected,'unread':unread}
@app.get('/api/notifications')
def notes(): require_active_profile(); c=conn();notify(c);notify_planned(c);r=rows(c.execute('SELECT * FROM notifications WHERE user_id=active_user_id() ORDER BY created_at DESC'));c.close();return r
@app.put('/api/notifications/{i}/read')
def read_note(i:int): require_active_profile(); c=conn();c.execute('UPDATE notifications SET read=1 WHERE id=? AND user_id=active_user_id()',(i,));c.commit();c.close();return {'ok':True}
@app.api_route('/api/{resource}',methods=['GET','POST'])
def collections(resource:str, body:Optional[Data]=None):
    if resource == 'assistant':
        return assistant(body)
    if resource not in ('goals','planned_expenses'):
        raise HTTPException(404)
    require_active_profile()
    c=conn()
    if body:
        d=body.data
        if resource=='goals':
            c.execute('INSERT INTO goals(user_id,name,target,current,target_date) VALUES(active_user_id(),?,?,?,?)',(d['name'],d['target'],d.get('current',0),d.get('target_date')))
        else:
            c.execute('INSERT INTO planned_expenses(user_id,description,amount,category,expected_date,reminder_time,reminder_offset,recurrence,payment_status) VALUES(active_user_id(),?,?,?,?,?,?,?,?)',(d['description'],d['amount'],d['category'],d['expected_date'],d.get('reminder_time','09:00'),d.get('reminder_offset','1 day before'),d.get('recurrence','None'),'pending'))
        c.commit()
    r=rows(c.execute(f'SELECT * FROM {resource} WHERE user_id=active_user_id() ORDER BY id DESC'))
    c.close()
    return r
@app.put('/api/planned_expenses/{i}/status')
def planned_status(i:int,body:Data):
    action=body.data.get('action'); require_active_profile(); c=conn(); item=c.execute("SELECT * FROM planned_expenses WHERE id=? AND user_id=active_user_id() AND payment_status!='paid'",(i,)).fetchone()
    if not item:
        c.close(); raise HTTPException(404,'Planned expense not found')
    if action=='paid':
        c.execute('INSERT INTO transactions(user_id,description,amount,date,type,category) VALUES(active_user_id(),?,?,?,?,?)',(item['description'],item['amount'],item['expected_date'],'expense',item['category']))
        c.execute("UPDATE planned_expenses SET payment_status='paid' WHERE id=? AND user_id=active_user_id()",(i,))
        if item['recurrence']=='Every month':
            next_date=date.fromisoformat(item['expected_date']); next_month=next_date.month%12+1; next_year=next_date.year+(next_date.month//12); next_date=next_date.replace(year=next_year,month=next_month,day=min(next_date.day,calendar.monthrange(next_year,next_month)[1]))
            c.execute('INSERT INTO planned_expenses(user_id,description,amount,category,expected_date,reminder_time,reminder_offset,recurrence,payment_status) VALUES(active_user_id(),?,?,?,?,?,?,?,?)',(item['description'],item['amount'],item['category'],next_date.isoformat(),item['reminder_time'],item['reminder_offset'],item['recurrence'],'pending'))
        elif item['recurrence']=='Every 28 days':
            next_date=date.fromisoformat(item['expected_date'])+timedelta(days=28)
            c.execute('INSERT INTO planned_expenses(user_id,description,amount,category,expected_date,reminder_time,reminder_offset,recurrence,payment_status) VALUES(active_user_id(),?,?,?,?,?,?,?,?)',(item['description'],item['amount'],item['category'],next_date.isoformat(),item['reminder_time'],item['reminder_offset'],item['recurrence'],'pending'))
        notify(c)
    elif action=='not_paid':
        message=f"Reminder: {item['description']} ({item['expected_date']}) for {item['amount']:.2f} has not been marked paid yet.";c.execute('INSERT OR IGNORE INTO notifications(user_id,message,level,key,created_at) VALUES(active_user_id(),?,?,?,?)',(message,'info',f"pending-{i}-{datetime.now().date().isoformat()}",datetime.now().isoformat()))
    else:
        c.close(); raise HTTPException(400,'Unknown payment status action')
    c.commit();c.close();return {'ok':True}
@app.put('/api/goals/{i}')
def goal(i:int,body:Data): d=body.data;require_active_profile();c=conn();c.execute('UPDATE goals SET name=?,target=?,current=?,target_date=? WHERE id=? AND user_id=active_user_id()',(d['name'],d['target'],d['current'],d.get('target_date'),i));c.commit();c.close();return {'ok':True}
@app.delete('/api/{resource}/{i}')
def delete_resource(resource:str,i:int):
 if resource not in ('goals','planned_expenses'):raise HTTPException(404)
 require_active_profile(); c=conn();c.execute(f'DELETE FROM {resource} WHERE id=? AND user_id=active_user_id()',(i,));c.commit();c.close();return {'ok':True}
@app.post('/api/assistant')
def assistant(body:Data):
    d = body.data
    q = str(d.get('question', '')).strip().lower()
    price = float(d.get('price') or 0)
    category = str(d.get('category') or 'Other')
    require_active_profile()
    c = conn()
    profile = c.execute('SELECT name,currency,monthly_income,rent,tuition FROM users WHERE id=active_user_id()').fetchone()
    current_month = month()
    previous_month = (date.today().replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
    budget_row = budget(c)
    budget_limit = float(budget_row['spending_limit'] or 0)
    income = float(budget_row['income'] or profile['monthly_income'] or 0)
    spent = scalar(c, "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=active_user_id() AND type='expense' AND substr(date,1,7)=?", (current_month,))
    previous_spent = scalar(c, "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=active_user_id() AND type='expense' AND substr(date,1,7)=?", (previous_month,))
    category_spent = scalar(c, "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=active_user_id() AND type='expense' AND category=? AND substr(date,1,7)=?", (category, current_month))
    category_limit = scalar(c, 'SELECT COALESCE(amount,0) FROM category_budgets WHERE budget_id=? AND category=?', (budget_row['id'], category))
    planned = scalar(c, "SELECT COALESCE(SUM(amount),0) FROM planned_expenses WHERE user_id=active_user_id() AND payment_status!='paid' AND expected_date>=?", (date.today().isoformat(),))
    goals = rows(c.execute('SELECT name,target,current FROM goals WHERE user_id=active_user_id()', ()))
    c.close()

    days_in_month = calendar.monthrange(date.today().year, date.today().month)[1]
    days_elapsed = max(date.today().day, 1)
    days_left = max(days_in_month - date.today().day, 0)
    projected = spent / days_elapsed * days_in_month
    available_budget = budget_limit if budget_limit > 0 else max(income - float(profile['rent'] or 0) - float(profile['tuition'] or 0), 0)
    remaining_budget = max(available_budget - spent, 0)
    remaining_after_planned = remaining_budget - planned
    daily_room = max(remaining_after_planned, 0) / max(days_left, 1)
    currency = profile['currency'] or 'INR'
    fmt = lambda value: f'{currency} {value:,.2f}'
    c = conn()
    top = c.execute("SELECT category,SUM(amount) amount FROM transactions WHERE user_id=active_user_id() AND type='expense' AND substr(date,1,7)=? GROUP BY category ORDER BY amount DESC LIMIT 1", (current_month,)).fetchone()
    c.close()
    top_category = top['category'] if top else 'no category yet'

    if price:
        category_remaining = max(float(category_limit) - category_spent, 0) if category_limit else remaining_after_planned
        can_afford = price <= max(remaining_after_planned, 0) and price <= category_remaining
        text = (f"Based on your {current_month} profile, {'yes' if can_afford else 'no'}: a {fmt(price)} {category} purchase "
                f"{'fits' if can_afford else 'does not fit'} after {fmt(planned)} in upcoming expenses. "
                f"You have {fmt(remaining_after_planned)} available after planned expenses"
                + (f" and {fmt(category_remaining)} remaining in {category}." if category_limit else '.'))
    elif 'until' in q or 'run out' in q or 'last' in q:
        if not spent and not planned:
            text = f"There is no current-month spending or upcoming-expense data for {profile['name'] or 'this profile'}, so I cannot reliably predict whether your money will last."
        else:
            outlook = 'on track' if projected <= available_budget else 'likely to exceed your spending capacity'
            text = (f"Your current pace is {fmt(spent / days_elapsed)} per day, projecting {fmt(projected)} this month. "
                    f"That is {outlook} against {fmt(available_budget)} available, with {fmt(planned)} still planned. "
                    f"Keep new spending to about {fmt(daily_room)} per remaining day to stay within your profile.")
    elif 'previous' in q or 'compare' in q or 'more' in q:
        if not previous_spent:
            text = f"There is no previous-month expense data for {profile['name'] or 'this profile'}, so a comparison would not be reliable. Current-month expenses are {fmt(spent)}."
        else:
            change = (spent - previous_spent) / previous_spent * 100
            direction = 'more' if change > 0 else 'less'
            text = f"You have spent {fmt(spent)} this month versus {fmt(previous_spent)} last month, which is {abs(change):.1f}% {direction}. Your largest current-month category is {top_category}."
    else:
        goal_text = f" You have {len(goals)} active savings goal(s)." if goals else ''
        text = (f"Your largest current-month category is {top_category} at {fmt(float(top['amount']) if top else 0)}. "
                f"You have spent {fmt(spent)} of {fmt(available_budget)}, leaving {fmt(remaining_after_planned)} after planned expenses. "
                f"That gives you about {fmt(daily_room)} per remaining day.{goal_text}")
    return {'answer': text, 'generated': True, 'source': 'active_profile_financial_data'}
