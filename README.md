# Pennywise Student

Personal-finance companion for students, built with React, FastAPI, and SQLite.

## Run locally

Open two terminals from the project folder:

```powershell
cd backend
uvicorn main:app --reload --port 8000
```

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

The Vite development server proxies `/api` to FastAPI automatically. To deploy the frontend separately, set `VITE_API_URL` to the API URL (including `/api`).

### OTP email delivery

The backend sends verification codes through Gmail from `githappens192@gmail.com`. Copy `backend/.env.example` to `backend/.env` and replace `your_gmail_app_password` with a Gmail App Password for that account:

```powershell
cd backend
Copy-Item .env.example .env
```

Enable 2-Step Verification on the Gmail account, create an App Password, and place that 16-character value in `backend/.env`. The backend loads this file automatically. Port `587` uses STARTTLS. Do not commit `.env` or the App Password. Signup sends the OTP to the exact email address entered by the user, stores it hashed, and expires it after five minutes. A verified account is remembered from the backend and will not be asked to verify repeatedly.

Financial data is stored in `backend/student_finance.db` and remains available across restarts. Each verified email has its own profile, transactions, budgets, goals, planned expenses, categories, notifications, and history. Signing in with a different account never exposes another account's data.
