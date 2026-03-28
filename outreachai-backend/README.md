# OutreachAI Backend — Email Automation Engine

## 📁 Folder Structure
```
outreachai-backend/
├── .env.example      ← Copy to .env and fill keys
├── package.json
├── src/
│   ├── server.js       ← API server (port 4000)
│   ├── worker.js       ← Email sending worker
│   ├── db.js           ← Supabase database helper
│   ├── emailSender.js  ← Gmail SMTP sender
│   ├── aiGenerator.js  ← OpenAI email generator
│   ├── queue.js        ← Upstash Redis queue
│   └── setup-check.js  ← Connection checker
```

## 🚀 Setup (Step by Step)

### Step 1: Install
```bash
cd outreachai-backend
npm install
```

### Step 2: Create .env file
```bash
cp .env.example .env
```
Then fill in your API keys in `.env`

### Step 3: Gmail App Password (IMPORTANT)
Gmail regular password NAHI chalega. App Password chahiye:
1. Go to: https://myaccount.google.com/apppasswords
2. 2FA must be ON
3. Generate password for "Mail"
4. 16-character password milega — wo use karo

### Step 4: Check Setup
```bash
npm run setup
```
Ye sab connections check karega.

### Step 5: Start Server
```bash
npm start
```
Server chalega: http://localhost:4000

### Step 6: Start Worker (separate terminal)
```bash
npm run worker
```
Ye background me emails send karega.

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Server + DB status |
| GET | /api/leads | Get all leads |
| POST | /api/leads | Add lead |
| POST | /api/leads/bulk | Import leads |
| PUT | /api/leads/:id | Update lead |
| DELETE | /api/leads/:id | Delete lead |
| GET | /api/accounts | Get email accounts |
| POST | /api/accounts | Add account |
| PUT | /api/accounts/:id | Update account |
| DELETE | /api/accounts/:id | Delete account |
| POST | /api/accounts/:id/verify | Verify SMTP |
| POST | /api/accounts/:id/toggle | Enable/disable |
| GET | /api/campaigns | Get campaigns |
| POST | /api/campaigns | Create campaign |
| POST | /api/campaigns/:id/start | Start sending |
| POST | /api/campaigns/:id/pause | Pause campaign |
| DELETE | /api/campaigns/:id | Delete campaign |
| POST | /api/ai/generate-email | AI email |
| POST | /api/ai/generate-followup | AI followup |
| POST | /api/ai/generate-reply | AI reply |
| POST | /api/send-email | Send single |
| GET | /api/replies | Get replies |
| GET | /api/queue/status | Queue info |
| POST | /api/queue/clear | Clear queue |
| GET | /api/analytics | Dashboard stats |
| GET | /api/settings | Get settings |
| PUT | /api/settings | Update settings |
| POST | /api/reset-daily | Reset daily counts |

## 🔥 How It Works

```
Frontend → API Server → Queue (Redis)
                            ↓
                    Worker picks job
                            ↓
                    Check: account available?
                    Check: under 50/day limit?
                    Check: 3-min delay passed?
                            ↓
                    AI generates email (OpenAI)
                            ↓
                    Send via Gmail SMTP
                            ↓
                    Log to Supabase
```

## ⚠️ Important Notes
- Gmail App Password use karo (NOT regular password)
- Pehle 5 emails/day se start karo, phir scale
- Worker alag terminal me chalao
- Daily counts Redis me auto-expire hote hain (24h)
