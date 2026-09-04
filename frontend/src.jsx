import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Home,
  ReceiptText,
  WalletCards,
  TrendingUp,
  Sparkles,
  Target,
  Bell,
  User,
  Plus,
  Trash2,
  Edit3,
  Menu,
  X,
  CalendarDays,
  Clock,
  Repeat,
  LogOut,
} from "lucide-react";
import "./style.css";
const A = import.meta.env.VITE_API_URL || "/api";
const api = async (p, o = {}) => {
  let r = await fetch(A + p, {
    ...o,
    headers: {
      "Content-Type": "application/json",
      ...(localStorage.getItem("clockitpocket-user-email")
        ? { "X-User-Email": localStorage.getItem("clockitpocket-user-email") }
        : {}),
      ...o.headers,
    },
  });
  const text = await r.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!r.ok) {
    const msg =
      (data && (data.detail || data.message || data.error)) ||
      text ||
      "Request failed.";
    throw new Error(msg);
  }
  return data ?? {};
};
const money = (n, c = "INR") => {
  const currency = ["INR", "USD", "AUD", "GBP", "EUR", "CAD", "JPY", "SGD"].includes(c)
    ? c
    : "INR";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0);
};
const today = new Date().toISOString().slice(0, 10);
const categoryMeta = {
  "Books & Supplies": ["📚", "#7E9AD3"],
  Shopping: ["🛍️", "#D187A4"],
  Food: ["🍜", "#E29B79"],
  Bills: ["🧾", "#8492A6"],
  Fun: ["🎉", "#D2A855"],
  Travel: ["✈️", "#78B99A"],
  Tuitions: ["🎓", "#AA81BD"],
  Others: ["✨", "#B587C9"],
};
const meta = (n) => categoryMeta[n] || ["✦", "#AA81BD"];
function AppBrand({ className = "" }) {
  return (
    <div className={`app-brand ${className}`} aria-label="ClockItPocket student">
      <img
        src="/logo.png"
        alt="ClockItPocket logo"
        className="logo-img"
      />
      <span className="brand-copy">
        ClockItPocket
        <small>student</small>
      </span>
    </div>
  );
}
function App() {
  const savedSession =
    localStorage.getItem("clockitpocket-auth-done") === "true" &&
    localStorage.getItem("clockitpocket-user-email");
  const [p, setP] = useState(() =>
      savedSession ? null : { name: "", onboarded: 0 },
    ),
    [page, setPage] = useState("Home"),
    [dash, setDash] = useState(null),
    [cats, setCats] = useState([]),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState(null),
    [authDone, setAuthDone] = useState(
      () => localStorage.getItem("clockitpocket-auth-done") === "true",
    ),
    seen = useRef(new Set());
  const load = async () => {
    let [x, y, z] = await Promise.all([
      api("/profile"),
      api("/dashboard"),
      api("/categories"),
    ]);
    setP(x);
    setDash(y);
    setCats(z);
    let notes = await api("/notifications"),
      next = notes.find(
        (n) =>
          !n.read &&
          ["warning", "danger", "info"].includes(n.level) &&
          !seen.current.has(n.id),
      );
    if (next) {
      seen.current.add(next.id);
      setToast(next);
    }
  };
  useEffect(() => {
    if (authDone && localStorage.getItem("clockitpocket-user-email")) void load();
  }, [authDone]);
  useEffect(() => {
    if (authDone) {
      localStorage.setItem("clockitpocket-auth-done", "true");
    } else {
      localStorage.removeItem("clockitpocket-auth-done");
      localStorage.removeItem("clockitpocket-user-email");
    }
  }, [authDone]);
  const signOut = async () => {
    try {
      await api("/auth/signout", { method: "POST" });
    } finally {
      localStorage.removeItem("clockitpocket-auth-done");
      localStorage.removeItem("clockitpocket-setup-pending");
      setAuthDone(false);
      setP({ ...p, onboarded: 0 });
      setPage("Home");
      setMenu(false);
    }
  };
  if (!p) return <div className="loading">Loading your money space…</div>;
  if (!authDone)
    return (
      <AuthFlow
        done={load}
        onVerified={() => setAuthDone(true)}
        setPage={setPage}
      />
    );
  if (
    !p.onboarded &&
    localStorage.getItem("clockitpocket-setup-pending") === "true"
  )
    return <Onboard p={p} done={load} setPage={setPage} />;
  if (!p.onboarded) {
    localStorage.removeItem("clockitpocket-auth-done");
    localStorage.removeItem("clockitpocket-user-email");
    return (
      <AuthFlow
        done={load}
        onVerified={() => setAuthDone(true)}
        setPage={setPage}
      />
    );
  }
  let nav = [
    ["Home", Home],
    ["Transactions", ReceiptText],
    ["Expense Planner", CalendarDays],
    ["Budget", WalletCards],
    ["Spending Trends", TrendingUp],
    ["AI Money Assistant", Sparkles],
    ["Savings Goals", Target],
    ["Profile", User],
  ];
  return (
    <div className="app">
      <aside className={menu ? "open" : ""}>
        <AppBrand />
        {nav.map(([n, I]) => (
          <button
            key={n}
            className={page === n ? "active" : ""}
            onClick={() => {
              setPage(n);
              setMenu(false);
            }}
          >
            <I size={19} />
            {n}
          </button>
        ))}
        <button className="signout" onClick={signOut}>
          <LogOut size={19} />
          Sign out
        </button>
      </aside>
      <main>
        <header>
          <button className="mobile" onClick={() => setMenu(!menu)}>
            {menu ? <X /> : <Menu />}
          </button>
          <div>
            <small>Welcome back</small>
            <h2>{p.name}</h2>
          </div>
          <div className="headbuttons">
            <button onClick={() => setPage("Notifications")}>
              <Bell />
              {dash?.unread > 0 && <i />}
            </button>
            <button onClick={() => setPage("Profile")}>
              <User />
            </button>
          </div>
        </header>
        {toast && (
          <div className={"warning-toast " + toast.level} role="alert">
            <Bell size={18} />
            <span>{toast.message}</span>
            <button aria-label="Dismiss warning" onClick={() => setToast(null)}>
              <X size={17} />
            </button>
          </div>
        )}
        {page === "Home" && (
          <Dashboard d={dash} c={p.currency} go={setPage} reload={load} />
        )}{" "}
        {page === "Transactions" && (
          <Transactions cats={cats} c={p.currency} reload={load} />
        )}{" "}
        {page === "Expense Planner" && (
          <UpcomingPayments cats={cats} c={p.currency} reload={load} />
        )}{" "}
        {page === "Budget" && (
          <Budget cats={cats} c={p.currency} reload={load} />
        )}{" "}
        {page === "Spending Trends" && (
          <>
            <ExpenseTrends c={p.currency} refresh={dash} />
            <SpendingHeatmap />
          </>
        )}{" "}
        {page === "AI Money Assistant" && <Assistant cats={cats} />}{" "}
        {page === "Savings Goals" && <Goals c={p.currency} />}{" "}
        {page === "Notifications" && <Notifications />}{" "}
        {page === "Profile" && (
          <Profile
            p={p}
            done={load}
            setPage={setPage}
            onDeleted={() => {
              localStorage.removeItem("clockitpocket-auth-done");
              localStorage.removeItem("clockitpocket-user-email");
              localStorage.removeItem("clockitpocket-setup-pending");
              setAuthDone(false);
              setP({ name: "", onboarded: 0 });
              setPage("Home");
            }}
          />
        )}
      </main>
    </div>
  );
}
function AuthFlow({ done, onVerified, setPage }) {
  const [stage, setStage] = useState("signup"),
    [form, setForm] = useState({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    }),
    [otp, setOtp] = useState(["", "", "", "", "", ""]),
    [maskedEmail, setMaskedEmail] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [resend, setResend] = useState(42);
  useEffect(() => {
    if (stage !== "otp") return;
    const timer = setInterval(() => setResend((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [stage]);
  const maskEmail = (email) => {
    const [local, domain] = email.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  };
  const handleSignup = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
        const r = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          data: {
              name: form.name,
            email: form.email.toLowerCase(),
              password: form.password,
          },
        }),
      });
      setMaskedEmail(maskEmail(form.email));
      setStage("otp");
      setResend(42);
      if (r?.otp) {
        console.info("OTP sent for demo:", r.otp);
      }
    } catch (err) {
      setError(err.message || "Unable to create account.");
    } finally {
      setLoading(false);
    }
  };
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          data: {
            email: form.email.toLowerCase(),
            password: form.password,
          },
        }),
      });
      localStorage.setItem("clockitpocket-user-email", form.email.trim().toLowerCase());
      onVerified();
      await done();
    } catch (err) {
      setError(err.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  };
  const handleOtpInput = (index, val) => {
    if (!/\d/.test(val) && val !== "") return;
    const next = [...otp];
    next[index] = val.slice(-1);
    setOtp(next);
    if (val && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };
  const verifyOtp = async (e) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Enter the full 6-digit code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api("/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          data: { email: form.email.toLowerCase(), otp: code },
        }),
      });
      localStorage.setItem("clockitpocket-user-email", form.email.trim().toLowerCase());
      localStorage.setItem("clockitpocket-setup-pending", "true");
      onVerified();
      setStage("success");
      setPage("Profile");
      await done();
    } catch (err) {
      setError(
        err.message ||
          "Verification failed. Please check the code and try again.",
      );
      setLoading(false);
    }
  };
  const resendOtp = async () => {
    if (resend > 0) return;
    setResend(42);
    try {
      const r = await api("/auth/resend", {
        method: "POST",
        body: JSON.stringify({
          data: {
            email: form.email.toLowerCase(),
          },
        }),
      });
      if (r?.otp) {
        console.info("Resent OTP for demo:", r.otp);
      }
    } catch (err) {
      setError(err.message || "Unable to resend code.");
    }
  };
  return (
    <div className="auth-shell">
      <AppBrand className="page-brand" />
      <div className="auth-card">
        {stage === "signup" && (
          <>
            <h1>Create your account</h1>
            <p className="tagline">Your money. Your plans. Your pocket.</p>
            <form className="auth-form" onSubmit={handleSignup}>
              <label>
                Full name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Email address
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Password
                <input
                  required
                  type="password"
                  minLength="8"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </label>
              <label>
                Confirm password
                <input
                  required
                  type="password"
                  minLength="8"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm({ ...form, confirmPassword: e.target.value })
                  }
                />
              </label>
              {error && <div className="auth-error">{error}</div>}
              <button className="primary" disabled={loading}>
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </form>
            <p className="auth-switch">
              Already have an account?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setError("");
                  setStage("login");
                }}
              >
                Log In
              </button>
            </p>
            </>
          )}
        {stage === "login" && (
          <>
            <h1>Welcome back</h1>
            <form className="auth-form" onSubmit={handleLogin}>
              <label>
                Email address
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Password
                <input
                  required
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </label>
              {error && <div className="auth-error">{error}</div>}
              <button className="primary" disabled={loading}>
                {loading ? "Logging in..." : "Log In"}
              </button>
            </form>
            <p className="auth-switch">
              New to ClockItPocket?{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setError("");
                  setStage("signup");
                }}
              >
                Create an account
              </button>
            </p>
          </>
        )}
        {stage === "otp" && (
          <>
            <div className="otp-header">
              <h1>Verify your email</h1>
              <p>We’ve sent a 6-digit verification code to</p>
              <strong>{maskedEmail}</strong>
            </div>
            <div className="otp-grid">
              {otp.map((digit, index) => (
                <input
                  id={`otp-${index}`}
                  key={index}
                  inputMode="numeric"
                  maxLength="1"
                  value={digit}
                  onChange={(e) => handleOtpInput(index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !digit && index > 0) {
                      document.getElementById(`otp-${index - 1}`)?.focus();
                    }
                  }}
                />
              ))}
            </div>
            {resend > 0 ? (
              <p className="otp-meta">
                Resend OTP in 00:{String(resend).padStart(2, "0")}
              </p>
            ) : (
              <button type="button" className="text-button" onClick={resendOtp}>
                Didn’t receive the code? Resend OTP
              </button>
            )}
            <button className="primary" disabled={loading} onClick={verifyOtp}>
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>
            {error && <div className="auth-error">{error}</div>}
            <button
              type="button"
              className="back-link"
              onClick={() => setStage("signup")}
            >
              ← Change email
            </button>
          </>
        )}
        {stage === "success" && (
          <>
            <div className="success-mark">✓</div>
            <h1>You’re verified!</h1>
            <p>Your ClockItPocket account is ready.</p>
            <button className="primary" onClick={() => setPage("Profile")}>
              Get Started →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
function Onboard({ p, done, setPage }) {
  let [s, set] = useState({
    name: p.name || "",
    email: p.email || "",
    student_type: "",
    currency: "INR",
    income_source: "",
    monthly_income: "",
    rent: "",
    tuition: "",
  });
  return (
    <div className="onboard">
      <AppBrand className="page-brand" />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/profile", {
            method: "PUT",
            body: JSON.stringify({
              data: {
                ...s,
                monthly_income: Number(s.monthly_income) || 0,
                rent: Number(s.rent) || 0,
                tuition: Number(s.tuition) || 0,
                onboarded: 1,
              },
            }),
          });
          localStorage.removeItem("clockitpocket-setup-pending");
          await done();
          setPage("Budget");
        }}
      >
        <h1>Your money, made simple.</h1>
        <p>Set up your student financial companion.</p>
        {[
          ["name", "Your name"],
          ["email", "Gmail / email"],
          ["monthly_income", "Typical monthly income"],
          ["rent", "Monthly rent / hostel"],
          ["tuition", "Monthly tuition"],
        ].map(([k, l]) => (
          <label key={k}>
            {l}
            <input
              required={k === "name" || k === "email"}
              type={
                k.includes("monthly") || k === "rent" || k === "tuition"
                  ? "number"
                  : "text"
              }
              value={s[k]}
              onChange={(e) => set({ ...s, [k]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Student type
          <select
            value={s.student_type}
            onChange={(e) => set({ ...s, student_type: e.target.value })}
          >
            {[
              "School student",
              "Bachelor’s student",
              "Master’s student",
              "Other",
            ].map((x) => (
              <option>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Currency
          <select
            value={s.currency}
            onChange={(e) => set({ ...s, currency: e.target.value })}
          >
            {["INR", "USD", "AUD", "GBP", "EUR", "CAD", "JPY", "SGD"].map(
              (x) => (
                <option>{x}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Main source of money
          <select
            value={s.income_source}
            onChange={(e) => set({ ...s, income_source: e.target.value })}
          >
            {[
              "Family/parent allowance",
              "Part-time job",
              "Scholarship",
              "Internship",
              "Student loan",
              "Multiple sources",
              "Other",
            ].map((x) => (
              <option>{x}</option>
            ))}
          </select>
        </label>
        <button className="primary">Create my dashboard →</button>
      </form>
    </div>
  );
}
function Dashboard({ d, c, go, reload }) {
  if (!d)
    return (
      <section className="panel">
        <p className="empty">Loading dashboard...</p>
      </section>
    );
  let insight = d.categories[0]
    ? `You spent ${money(d.categories[0].amount, c)} on ${d.categories[0].category} this month.`
    : "Add a transaction to get your first spending insight.";
  let leftOver = Number(d.left || 0) <= 0;
  let overBy = Math.max(
    0,
    Number(d.spent || 0) - Number(d.budget?.spending_limit || 0),
  );
  return (
    <>
      <section className="hero">
        <div>
          <p>Here’s your financial snapshot</p>
          <h1>Feel good about your money.</h1>
        </div>
        <button className="primary" onClick={() => go("Transactions")}>
          <Plus /> Add transaction
        </button>
      </section>
      <div className="cards">
        {[
          ["Money available", d.available, "balance"],
          ["Spent this month", d.spent, "spent"],
          ["Left to spend", d.left, "left"],
          ["Days left", d.days, "days"],
        ].map(([l, n, k]) => {
          let content = k === "days" ? n : money(n, c);
          let warn = k === "left" && leftOver;
          return (
            <article key={k} className={k}>
              <small>{l}</small>
              <strong>{content}</strong>
              {warn && (
                <small className="over-budget">
                  Overexpenditure: spent {money(overBy, c)} above monthly
                  budget.
                </small>
              )}
            </article>
          );
        })}
      </div>
      <div className="grid">
        <section className="panel">
          <h3>Spending by category</h3>
          {d.categories.length ? (
            d.categories.map((x, i) => (
              <div className="bar" key={`${x.category}-${i}`}>
                <span>{x.category}</span>
                <div>
                  <i
                    style={{
                      width: `${Math.min(100, (x.amount / Math.max(...d.categories.map((z) => z.amount))) * 100)}%`,
                    }}
                  />
                </div>
                <b>{money(x.amount, c)}</b>
              </div>
            ))
          ) : (
            <Empty text="Your category spending will appear here." />
          )}
        </section>
      </div>
      <div className="grid">
        <section className="panel health">
          <h3>Financial health</h3>
          <strong>{d.health}</strong>
          <p>{insight}</p>
          <p>
            You have {money(d.left, c)} for the remaining {d.days} days.
          </p>
        </section>
        <section className="panel">
          <h3>
            Recent transactions{" "}
            <button onClick={() => go("Transactions")}>View all</button>
          </h3>
          <TxList items={d.recent} c={c} />
        </section>
      </div>
      <div className="grid">
        <section className="panel upcoming-home">
          <h3>
            Expense Planner{" "}
            <button onClick={() => go("Expense Planner")}>Manage</button>
          </h3>
          <div className="upcoming-total">
            <span>Total committed</span>
            <b>{money(d.upcoming_total, c)}</b>
            <small>
              Forecast balance after planned expenses:{" "}
              {money(d.forecast_balance, c)}
            </small>
          </div>
          {d.planned.length ? (
            <TxList items={d.planned} c={c} />
          ) : (
            <Empty text="No planned expenses yet." />
          )}
        </section>
      </div>
    </>
  );
}
function SpendingHeatmap() {
  let [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const result = await api("/heatmap");
      if (active) setData(result);
    })();
    return () => {
      active = false;
    };
  }, []);
  if (!data)
    return (
      <section className="panel heatmap">
        <h3>Spending heatmap</h3>
        <p className="empty">Loading calendar...</p>
      </section>
    );
  let max = Math.max(1, ...data.days.map((x) => x.amount)),
    weekend = data.days
      .filter((x) => [5, 6].includes(new Date(x.date + "T00:00:00").getDay()))
      .reduce((sum, x) => sum + x.amount, 0),
    weekday = data.days
      .filter((x) => ![0, 6].includes(new Date(x.date + "T00:00:00").getDay()))
      .reduce((sum, x) => sum + x.amount, 0),
    conclusion =
      weekend > weekday * 0.35
        ? "Your spending is strongest on weekends."
        : "Your spending is spread mostly across weekdays.";
  return (
    <section className="panel heatmap">
      <div className="heatmap-head">
        <div>
          <h3>Spending heatmap</h3>
          <small>{data.month}</small>
        </div>
        <div className="heatmap-legend">
          <span>
            <i className="low" />
            Low
          </span>
          <span>
            <i className="moderate" />
            Moderate
          </span>
          <span>
            <i className="high" />
            High
          </span>
          <span>
            <i className="very-high" />
            Very high
          </span>
        </div>
      </div>
      <div className="calendar-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <small key={`day-label-${day}-${index}`}>{day}</small>
        ))}
        {Array.from({ length: data.start_weekday }).map((_, i) => (
          <span key={`calendar-empty-${i}`} className="calendar-empty" />
        ))}
        {data.days.map((day) => {
          let intensity =
            day.amount === 0
              ? "low"
              : day.amount <= max * 0.25
                ? "moderate"
                : day.amount <= max * 0.65
                  ? "high"
                  : "very-high";
          return (
            <span
              key={day.date}
              className={"heat-cell " + intensity}
              title={`${day.date}: ${money(day.amount)}`}
            >
              {new Date(day.date + "T00:00:00").getDate()}
            </span>
          );
        })}
      </div>
      <p className="heatmap-conclusion">{conclusion}</p>
    </section>
  );
}
const chartColors = [
  "#AA81BD",
  "#D187A4",
  "#E29B79",
  "#78B99A",
  "#7E9AD3",
  "#D2A855",
  "#8492A6",
  "#B587C9",
];
function UpcomingPayments({ cats, c, reload }) {
  let [list, setList] = useState([]),
    [form, setForm] = useState({
      description: "",
      amount: "",
      category: cats[0]?.name || "Other",
      expected_date: today,
      reminder_time: "09:00",
      reminder_offset: "1 day before",
      recurrence: "None",
    });
  let load = async () => {
    const data = await api("/planned_expenses");
    setList(data);
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (cats.length && !form.category)
      setForm((x) => ({ ...x, category: cats[0].name }));
  }, [cats]);
  let total = list.reduce((sum, item) => sum + Number(item.amount), 0),
    due = list.filter(
      (item) => item.payment_status !== "paid" && item.expected_date <= today,
    ),
    save = async (e) => {
      e.preventDefault();
      await api("/planned_expenses", {
        method: "POST",
        body: JSON.stringify({ data: form }),
      });
      setForm({ ...form, description: "", amount: "" });
      load();
      reload();
    };
  let respond = async (action, item) => {
    await api("/planned_expenses/" + item.id + "/status", {
      method: "PUT",
      body: JSON.stringify({ data: { action } }),
    });
    load();
    reload();
  };
  return (
    <section>
      {due.length > 0 && (
        <div className="payment-confirmation">
          <div>
            <b>Payment confirmation</b>
            <span>
              {due[0].description} was due on {due[0].expected_date} for{" "}
              {money(due[0].amount, c)}. Has this payment been made?
            </span>
          </div>
          <div>
            <button
              className="confirm-paid"
              onClick={() => respond("paid", due[0])}
            >
              Yes, payment made
            </button>
            <button
              className="confirm-pending"
              onClick={() => respond("not_paid", due[0])}
            >
              Not yet, remind me
            </button>
          </div>
        </div>
      )}
      <div className="title">
        <h1>Expense Planner</h1>
        <p>Plan ahead and protect your future balance.</p>
      </div>
      <div className="upcoming-layout">
        <section className="panel">
          <h3>Add planned expense</h3>
          <form className="formgrid" onSubmit={save}>
            <label>
              Description
              <input
                required
                placeholder="e.g. Pay rent"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <label>
              Amount
              <input
                required
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {cats.map((x) => (
                  <option>{x.name}</option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                required
                type="date"
                value={form.expected_date}
                onChange={(e) =>
                  setForm({ ...form, expected_date: e.target.value })
                }
              />
            </label>
            <label>
              Reminder
              <select
                value={form.reminder_offset}
                onChange={(e) =>
                  setForm({ ...form, reminder_offset: e.target.value })
                }
              >
                <option>At the exact time</option>
                <option>1 hour before</option>
                <option>1 day before</option>
                <option>3 days before</option>
                <option>1 week before</option>
              </select>
            </label>
            <label>
              Reminder time
              <input
                type="time"
                value={form.reminder_time}
                onChange={(e) =>
                  setForm({ ...form, reminder_time: e.target.value })
                }
              />
            </label>
            <label>
              Repeats
              <select
                value={form.recurrence}
                onChange={(e) =>
                  setForm({ ...form, recurrence: e.target.value })
                }
              >
                <option>None</option>
                <option>Every month</option>
                <option>Every 28 days</option>
              </select>
            </label>
            <button className="primary">
              <CalendarDays size={17} /> Add expense
            </button>
          </form>
          {form.amount && (
            <div className="impact-warning">
              <b>Upcoming expense detected</b>
              <span>
                Your available money will be reduced by {money(form.amount, c)}{" "}
                when this payment is due.
              </span>
            </div>
          )}
        </section>
        <section className="panel forecast-card">
          <h3>Upcoming money forecast</h3>
          <small>Total planned expenses</small>
          <strong>{money(total, c)}</strong>
          <p>These expenses are already committed in your plan.</p>
          <div className="forecast-line">
            <span>Planned expenses</span>
            <b>{list.length}</b>
          </div>
        </section>
      </div>
      <section className="panel payments-list">
        <div className="list-heading">
          <h3>Planned expenses</h3>
          <b>{money(total, c)} total</b>
        </div>
        {list.length ? (
          list.map((item) => (
            <div key={item.id || `${item.description}-${item.expected_date}`} className="payment-row">
              <span className="payment-date">
                <b>{new Date(item.expected_date + "T00:00:00").getDate()}</b>
                <small>
                  {new Date(item.expected_date + "T00:00:00").toLocaleString(
                    undefined,
                    { month: "short" },
                  )}
                </small>
              </span>
              <span className="payment-info">
                <b>{item.description}</b>
                <small>
                  {item.category} · <Clock size={12} />{" "}
                  {item.reminder_time || "09:00"} ·{" "}
                  {item.reminder_offset || "1 day before"}
                  {item.recurrence && item.recurrence !== "None" && (
                    <>
                      {" "}
                      · <Repeat size={12} /> {item.recurrence}
                    </>
                  )}
                </small>
              </span>
              <strong>{money(item.amount, c)}</strong>
              <button
                className="delete-payment"
                aria-label="Delete planned expense"
                onClick={async () => {
                  await api("/planned_expenses/" + item.id, {
                    method: "DELETE",
                  });
                  load();
                  reload();
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <Empty text="No planned expenses yet." />
        )}
      </section>
    </section>
  );
}
function ExpenseTrends({ c, refresh }) {
  let [range, setRange] = useState("monthly"),
    [data, setData] = useState(null),
    [comparison, setComparison] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const [trends, compare] = await Promise.all([
        api("/trends?range=" + range),
        api("/trend-comparison?range=" + range),
      ]);
      if (active) {
        setData(trends);
        setComparison(compare);
      }
    })();
    return () => {
      active = false;
    };
  }, [range, refresh]);
  if (!data || !comparison)
    return (
      <div className="trends-layout">
        <section className="panel trends">
          <h3>Expenditure trends</h3>
          <p className="empty">Loading expenditure...</p>
        </section>
      </div>
    );
  let max = Math.max(1, ...data.series.flatMap((x) => x.values)),
    width = 520,
    height = 190,
    pad = 24,
    xStep = (width - pad * 2) / Math.max(1, data.labels.length - 1),
    point = (value, index) =>
      `${pad + index * xStep},${height - pad - (value / max) * (height - pad * 2)}`,
    totals = data.series.map((x) =>
      x.values.reduce((sum, value) => sum + value, 0),
    ),
    total = totals.reduce((sum, value) => sum + value, 0),
    periodTotals = data.labels.map((_, index) =>
      data.series.reduce((sum, series) => sum + series.values[index], 0),
    ),
    peakIndex = periodTotals.indexOf(Math.max(...periodTotals)),
    topIndex = totals.indexOf(Math.max(...totals)),
    first = periodTotals[0] || 0,
    last = periodTotals[periodTotals.length - 1] || 0,
    trend =
      last > first * 1.05
        ? "rising"
        : last < first * 0.95
          ? "falling"
          : "steady";
  return (
    <div className="trends-layout">
      <section className="panel trends">
        <div className="trend-head">
          <h3>Expenditure trends</h3>
          <div className="range-tabs">
            {[
              ["weekly", "Week"],
              ["monthly", "Month"],
              ["yearly", "Year"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={range === value ? "selected" : ""}
                onClick={() => setRange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="chart">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${range} expenditure chart`}
          >
            <defs>
              <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#AA81BD" stopOpacity=".18" />
                <stop offset="1" stopColor="#AA81BD" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((level) => (
              <line
                x1={pad}
                x2={width - pad}
                y1={height - pad - level * (height - pad * 2)}
                y2={height - pad - level * (height - pad * 2)}
              />
            ))}
            {data.series.map((series, index) => (
              <React.Fragment key={series.category || index}>
                <polyline
                  points={series.values.map(point).join(" ")}
                  style={{ stroke: chartColors[index % chartColors.length] }}
                />
                {series.values.map((value, pointIndex) => (
                  <circle
                    key={`${series.category}-${pointIndex}`}
                    cx={pad + pointIndex * xStep}
                    cy={height - pad - (value / max) * (height - pad * 2)}
                    r="3.5"
                    style={{ fill: chartColors[index % chartColors.length] }}
                  />
                ))}
              </React.Fragment>
            ))}
          </svg>
          <div className="chart-labels">
            {data.labels.map((label, index) => (
              <small key={`${label}-${index}`}>{label}</small>
            ))}
          </div>
        </div>
        {data.series.length ? (
          <div className="legend">
            {data.series.map((series, index) => (
              <span key={series.category || index}>
                <i
                  style={{
                    background: chartColors[index % chartColors.length],
                  }}
                />
                {series.category}
              </span>
            ))}
          </div>
        ) : (
          <p className="empty">No expense data for this period.</p>
        )}
      </section>
      <section className="panel trend-summary">
        <h3>What your spending says</h3>
        {data.series.length ? (
          <>
            <div className="summary-total">
              <small>Total tracked</small>
              <strong>{money(total, c)}</strong>
            </div>
            <p>
              <b>{data.series[topIndex].category}</b> is your highest expense
              category at <b>{money(totals[topIndex], c)}</b>.
            </p>
            <p>
              Spending is <b>{trend}</b> across this {range} view.
            </p>
            <p>
              Your highest period was <b>{data.labels[peakIndex]}</b>, with{" "}
              <b>{money(periodTotals[peakIndex], c)}</b> spent.
            </p>
          </>
        ) : (
          <p className="empty">
            Add expenses to see conclusions from your tracking.
          </p>
        )}
        {comparison.items.length > 0 && (
          <div className="comparison">
            <h4>{comparison.label}</h4>
            {comparison.items.map((item, index) => (
              <div className="comparison-row" key={`${item.category}-${index}`}>
                <span>{item.category}</span>
                <b
                  className={
                    item.change > 0 ? "up" : item.change < 0 ? "down" : ""
                  }
                >
                  {item.change > 0 ? "↑" : item.change < 0 ? "↓" : "→"}{" "}
                  {Math.abs(item.change)}%
                </b>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
function TxList({ items, c }) {
  return (
    <div className="txs">
      {items.map((x, index) => {
        let [m, color] = meta(x.category);
        return (
          <div key={`${x.id || x.description || x.category}-${index}`}>
            <span className="dot" style={{ background: color }}>
              {m}
            </span>
            <span>
              <b>{x.description || x.category}</b>
              <small>
                <span style={{ color }}>
                  {m} {x.category}
                </span>{" "}
                · {x.date || x.expected_date}
              </small>
            </span>
            <b className={x.type === "income" ? "income" : ""}>
              {x.type === "income" ? "+" : "-"}
              {money(x.amount, c)}
            </b>
          </div>
        );
      })}
    </div>
  );
}
function Empty({ text }) {
  return <p className="empty">{text}</p>;
}
function Transactions({ cats, c, reload }) {
  let [list, setList] = useState([]),
    [form, setForm] = useState(null),
    [filters, setF] = useState({ q: "", category: "", kind: "" });
  let load = async () => {
    const data = await api("/transactions?" + new URLSearchParams(filters));
    setList(data);
  };
  useEffect(() => {
    void load();
  }, [filters]);
  let save = async (e) => {
    e.preventDefault();
    if (form.category === "__new") {
      let n = prompt("New category name");
      if (!n) return;
      await api("/categories", {
        method: "POST",
        body: JSON.stringify({ data: { name: n } }),
      });
      form.category = n;
    }
    await api("/transactions" + (form.id ? "/" + form.id : ""), {
      method: form.id ? "PUT" : "POST",
      body: JSON.stringify({ data: form }),
    });
    setForm(null);
    load();
    reload();
  };
  return (
    <section>
      <div className="title">
        <h1>Transactions</h1>
        <p>Every rupee has a story.</p>
      </div>
      <div className="filters">
        <input
          placeholder="Search transactions"
          onChange={(e) => setF({ ...filters, q: e.target.value })}
        />
        <select
          onChange={(e) => setF({ ...filters, category: e.target.value })}
        >
          <option value="">All categories</option>
          {cats.map((x) => (
            <option key={x.id || x.name} value={x.name}>{x.name}</option>
          ))}
        </select>
        <select onChange={(e) => setF({ ...filters, kind: e.target.value })}>
          <option value="">Income & expense</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </div>
      <section className="panel">
        {list.map((x) => {
          let [m, color] = meta(x.category);
          return (
            <div key={x.id || `${x.description}-${x.date}`} className="transaction-row">
              <span className="dot" style={{ background: color }}>
                {m}
              </span>
              <span>
                <b>{x.description || x.category}</b>
                <small style={{ color }}>
                  {m} {x.category} · {x.date}
                </small>
              </span>
              <b className={x.type === "income" ? "income" : ""}>
                {x.type === "income" ? "+" : "-"}
                {money(x.amount, c)}
              </b>
              <small>Balance after: {money(x.balance_after, c)}</small>
              <button onClick={() => setForm(x)}>
                <Edit3 size={16} />
              </button>
              <button
                onClick={async () => {
                  if (confirm("Delete this transaction?")) {
                    await api("/transactions/" + x.id, { method: "DELETE" });
                    load();
                    reload();
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        {!list.length && <Empty text="No transactions match these filters." />}
      </section>
      <button
        className="fab"
        onClick={() =>
          setForm({
            description: "",
            amount: "",
            date: today,
            type: "expense",
            category: cats[0]?.name || "Food",
          })
        }
      >
        <Plus />
      </button>
      {form && (
        <Modal
          title={form.id ? "Edit transaction" : "Add transaction"}
          close={() => setForm(null)}
        >
          <form onSubmit={save}>
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {cats.map((x) => {
                  let [m] = meta(x.name);
                  return (
                    <option key={x.id || x.name} value={x.name}>
                      {m} {x.name}
                    </option>
                  );
                })}
                <option value="__new">+ Create category</option>
              </select>
            </label>
            <label>
              Amount
              <input
                required
                min="0"
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label>
              Description (optional)
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <label>
              Date
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              Type
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <button className="primary">Save transaction</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
function Budget({ cats, c, reload }) {
  let [b, setB] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const x = await api("/budget");
      if (!active) return;
      let saved = Object.fromEntries(
        x.categories.map((q) => [q.category, q.amount]),
      );
      setB({
        ...x,
        categories: cats.map((q) => ({
          category: q.name,
          amount: saved[q.name] || 0,
        })),
      });
    })();
    return () => {
      active = false;
    };
  }, [cats]);
  if (!b)
    return (
      <section className="panel">
        <p className="empty">Loading budget...</p>
      </section>
    );
  let spent = (n) => 0,
    save = async () => {
      await api("/budget", {
        method: "PUT",
        body: JSON.stringify({
          data: {
            ...b,
            income: Number(b.income) || 0,
            spending_limit: Number(b.spending_limit) || 0,
            savings_target: Number(b.savings_target) || 0,
            categories: b.categories.map((item) => ({
              ...item,
              amount: Number(item.amount) || 0,
            })),
          },
        }),
      });
      reload();
      alert("Monthly budget saved");
    };
  return (
    <section>
      <div className="title">
        <h1>Monthly budget</h1>
        <p>Give every amount a job.</p>
      </div>
      <section className="panel formgrid">
        <label>
          Monthly income
          <input
            type="number"
            value={b.income || ""}
            onChange={(e) => setB({ ...b, income: e.target.value })}
          />
        </label>
        <label>
          Spending budget
          <input
            type="number"
            value={b.spending_limit || ""}
            onChange={(e) => setB({ ...b, spending_limit: e.target.value })}
          />
        </label>
        <label>
          Savings target
          <input
            type="number"
            value={b.savings_target || ""}
            onChange={(e) => setB({ ...b, savings_target: e.target.value })}
          />
        </label>
      </section>
      <section className="panel">
        <h3>Category budgets</h3>
        {b.categories.map((x, i) => {
          let [m, color] = meta(x.category);
          return (
            <div key={`${x.category}-${i}`} className="budgetrow">
              <b style={{ color }}>
                {m} {x.category}
              </b>
              <input
                type="number"
                value={x.amount || ""}
                onChange={(e) => {
                  let z = [...b.categories];
                  z[i] = { ...x, amount: e.target.value };
                  setB({ ...b, categories: z });
                }}
              />
              <span>{money(spent(x.category), c)} spent</span>
            </div>
          );
        })}
        <button className="primary" onClick={save}>
          Save budget
        </button>
      </section>
    </section>
  );
}
function Assistant({ cats }) {
  let [q, setQ] = useState("Will my money last until the end of the month?"),
    [price, setPrice] = useState(""),
    [cat, setCat] = useState("Other"),
    [answer, setAnswer] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  let ask = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      let r = await api("/assistant", {
        method: "POST",
        body: JSON.stringify({ data: { question: q, price, category: cat } }),
      });
      setAnswer(r.answer);
    } catch (err) {
      setError(err.message || "Unable to generate guidance right now.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void ask();
  }, []);
  return (
    <section>
      <div className="title">
        <h1>AI Money Assistant</h1>
        <p>Clear answers based on your real data.</p>
      </div>
      <section className="panel assistant">
        <Sparkles />
        <h3>Can I afford this?</h3>
        <form onSubmit={ask}>
          <label>
            Ask anything about your spending
            <textarea value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="formgrid">
            <label>
              Purchase price (optional)
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              Category
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                {cats.map((x) => (
                  <option key={x.id || x.name} value={x.name}>{x.name}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary" disabled={loading}>
            {loading ? "Generating guidance..." : "Get guidance"}
          </button>
        </form>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {answer && <div className="answer">{answer}</div>}
      </section>
    </section>
  );
}
function Goals({ c }) {
  let [list, setList] = useState([]),
    [f, setF] = useState({ name: "", target: "", current: 0, target_date: "" });
  let load = async () => {
    const data = await api("/goals");
    setList(data);
  };
  useEffect(() => {
    void load();
  }, []);
  let add = async (e) => {
    e.preventDefault();
    await api("/goals", { method: "POST", body: JSON.stringify({ data: f }) });
    setF({ name: "", target: "", current: 0, target_date: "" });
    load();
  };
  return (
    <section>
      <div className="title">
        <h1>Savings goals</h1>
        <p>Small steps, meaningful wins.</p>
      </div>
      <section className="panel">
        <form className="formgrid" onSubmit={add}>
          <label>
            Goal name
            <input
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </label>
          <label>
            Target amount
            <input
              required
              type="number"
              value={f.target}
              onChange={(e) => setF({ ...f, target: e.target.value })}
            />
          </label>
          <label>
            Saved so far
            <input
              type="number"
              value={f.current}
              onChange={(e) => setF({ ...f, current: e.target.value })}
            />
          </label>
          <label>
            Target date
            <input
              type="date"
              value={f.target_date}
              onChange={(e) => setF({ ...f, target_date: e.target.value })}
            />
          </label>
          <button className="primary">Add goal</button>
        </form>
      </section>
      <div className="goalgrid">
        {list.map((x) => (
          <section className="panel goal" key={x.id || x.name}>
            <button
              className="icon"
              onClick={async () => {
                await api("/goals/" + x.id, { method: "DELETE" });
                load();
              }}
            >
              <Trash2 />
            </button>
            <h3>{x.name}</h3>
            <strong>
              {money(x.current, c)} / {money(x.target, c)}
            </strong>
            <div className="progress">
              <i
                style={{
                  width: Math.min(100, (x.current / x.target) * 100) + "%",
                }}
              />
            </div>
            <small>{Math.round((x.current / x.target) * 100)}% complete</small>
            <button
              onClick={async () => {
                let current = prompt("New saved amount", x.current);
                if (current !== null) {
                  await api("/goals/" + x.id, {
                    method: "PUT",
                    body: JSON.stringify({ data: { ...x, current } }),
                  });
                  load();
                }
              }}
            >
              Update saved amount
            </button>
          </section>
        ))}
      </div>
    </section>
  );
}
function Notifications() {
  let [list, setList] = useState([]);
  let load = async () => {
    const data = await api("/notifications");
    setList(data);
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <section>
      <div className="title">
        <h1>Notifications</h1>
        <p>Your timely money heads-up.</p>
      </div>
      <section className="panel">
        {list.length ? (
          list.map((x) => (
            <div key={x.id || x.message} className={"notice " + x.level}>
              <span>
                <b>{x.message}</b>
                <small>{new Date(x.created_at).toLocaleString()}</small>
              </span>
              {!x.read && (
                <button
                  onClick={async () => {
                    await api("/notifications/" + x.id + "/read", {
                      method: "PUT",
                    });
                    load();
                  }}
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty text="You’re all caught up." />
        )}
      </section>
    </section>
  );
}
function Profile({ p, done, setPage, onDeleted }) {
  let [s, set] = useState(p),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState("");
  const deleteAccount = async () => {
    if (!window.confirm("Delete your account and permanently erase all profile details, transactions, budgets, goals, notifications, and history? This cannot be undone.")) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api("/auth/account", { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setDeleteError(err.message || "Unable to delete the account.");
      setDeleting(false);
    }
  };
  return (
    <section>
      <div className="title">
        <h1>Your profile</h1>
        <p>Keep your financial setup current.</p>
      </div>
      <section className="panel">
        <form
          className="formgrid"
          onSubmit={async (e) => {
            e.preventDefault();
            await api("/profile", {
              method: "PUT",
              body: JSON.stringify({ data: { ...s, onboarded: 1 } }),
            });
            done();
            alert("Profile saved");
          }}
        >
          {[
            ["name", "Name"],
            ["email", "Email"],
            ["monthly_income", "Monthly income"],
            ["rent", "Rent / hostel"],
            ["tuition", "Tuition"],
          ].map(([k, l]) =>
            k === "monthly_income" ? (
              <label key={k}>
                {l}
                <button
                  type="button"
                  className="budget-link"
                  onClick={() => setPage("Budget")}
                >
                  {s[k] || "0"}
                </button>
              </label>
            ) : (
              <label>
                {l}
                <input
                  type={k === "name" || k === "email" ? "text" : "number"}
                  value={s[k] || ""}
                  onChange={(e) => set({ ...s, [k]: e.target.value })}
                />
              </label>
            ),
          )}
          <label>
            Student type
            <select
              value={s.student_type}
              onChange={(e) => set({ ...s, student_type: e.target.value })}
            >
              {[
                "School student",
                "Bachelor’s student",
                "Master’s student",
                "Other",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <select
              value={s.currency}
              onChange={(e) => set({ ...s, currency: e.target.value })}
            >
              {["INR", "USD", "AUD", "GBP", "EUR", "CAD"].map((x) => (
                <option>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Income source
            <input
              value={s.income_source || ""}
              onChange={(e) => set({ ...s, income_source: e.target.value })}
            />
          </label>
          <div className="profile-actions">
            <button className="primary" type="submit">
              Save changes
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setPage("Budget")}
            >
              Continue to budget setup
            </button>
          </div>
          <div className="danger-zone">
            <div>
              <strong>Delete account</strong>
              <p>Permanently erase your account and all saved financial history.</p>
            </div>
            <button className="danger-button" type="button" onClick={deleteAccount} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete account"}
            </button>
            {deleteError && <p className="form-error">{deleteError}</p>}
          </div>
        </form>
      </section>
    </section>
  );
}
function Modal({ title, children, close }) {
  return (
    <div className="modal">
      <section>
        <button className="close" onClick={close}>
          <X />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
const rootEl = document.getElementById("root");
if (!rootEl.__cip_root) {
  rootEl.__cip_root = createRoot(rootEl);
}
rootEl.__cip_root.render(<App />);
