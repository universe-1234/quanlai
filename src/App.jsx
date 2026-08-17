import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarBlank, Check, Clock, LockKey, ShieldCheck } from "@phosphor-icons/react";
import { couponApi, getNextRunLabel } from "./api.js";

const EMPTY_CODE = Array(6).fill("");

function Stepper({ step }) {
  const steps = ["手机验证", "设置时间", "开启自动领取"];
  return (
    <ol className="stepper" aria-label="设置进度">
      {steps.map((label, index) => {
        const number = index + 1;
        const state = number < step ? "complete" : number === step ? "active" : "idle";
        return (
          <li className={`step ${state}`} key={label} aria-current={state === "active" ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">
              {state === "complete" ? <Check weight="bold" /> : number}
            </span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OtpFields({ digits, onChange, disabled }) {
  const refs = useRef([]);

  const setDigit = (index, value) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      onChange(next);
      return;
    }
    const next = [...digits];
    clean.slice(0, 6 - index).split("").forEach((char, offset) => {
      next[index + offset] = char;
    });
    onChange(next);
    refs.current[Math.min(index + clean.length, 5)]?.focus();
  };

  return (
    <div className="otp-row" role="group" aria-label="六位短信验证码">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => { refs.current[index] = node; }}
          className="otp-input"
          value={digit}
          onChange={(event) => setDigit(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
            if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
            if (event.key === "ArrowRight" && index < 5) refs.current[index + 1]?.focus();
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (/^\d{6}$/.test(pasted)) {
              event.preventDefault();
              onChange(pasted.split(""));
              refs.current[5]?.focus();
            }
          }}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`验证码第 ${index + 1} 位`}
          placeholder="—"
          disabled={disabled}
        />
      ))}
    </div>
  );
}

export function App() {
  const [phone, setPhone] = useState("");
  const [digits, setDigits] = useState(EMPTY_CODE);
  const [time, setTime] = useState("00:00");
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [active, setActive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [bridgeState, setBridgeState] = useState("checking");
  const [securityUrl, setSecurityUrl] = useState("");

  const phoneValid = /^1\d{10}$/.test(phone);
  const code = digits.join("");
  const step = active ? 3 : verified ? 2 : 1;
  const nextRun = useMemo(() => getNextRunLabel(time), [time]);

  useEffect(() => {
    if (!countdown) return undefined;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    let activeRequest = true;
    couponApi.status()
      .then((result) => {
        if (!activeRequest) return;
        setBridgeState(result.bridge?.available ? "ready" : "unavailable");
        if (result.schedule?.enabled) setTime(result.schedule.time || "00:00");
      })
      .catch(() => activeRequest && setBridgeState("unavailable"));
    return () => { activeRequest = false; };
  }, []);

  const showMessage = (text, type = "info") => {
    setMessage(text);
    setMessageType(type);
  };

  const requestCode = async () => {
    if (!phoneValid) {
      showMessage("请输入正确的 11 位手机号", "error");
      return;
    }
    if (!termsAccepted) {
      showMessage("请先阅读并同意美团 Skill 服务使用规则", "error");
      return;
    }
    setBusy(true);
    setSecurityUrl("");
    try {
      await couponApi.requestOtp(phone, termsAccepted);
      setCodeSent(true);
      setCountdown(60);
      setVerified(false);
      setDigits(EMPTY_CODE);
      showMessage("验证码已发送，请查看手机短信（60 秒内有效）", "success");
    } catch (error) {
      setSecurityUrl(error.redirectUrl || "");
      showMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!codeSent) {
      showMessage("请先获取验证码", "error");
      return false;
    }
    if (code.length !== 6) {
      showMessage("请输入完整的 6 位验证码", "error");
      return false;
    }
    setBusy(true);
    try {
      await couponApi.verifyOtp(phone, code);
      setVerified(true);
      showMessage("手机号验证成功，可以设置执行时间了", "success");
      return true;
    } catch (error) {
      setVerified(false);
      showMessage(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    let verifiedNow = verified;
    if (!verifiedNow) verifiedNow = await verifyCode();
    if (!verifiedNow) return;
    setBusy(true);
    try {
      await couponApi.saveSchedule(time);
      setActive(true);
      showMessage(`自动领取已开启，下一次将在${nextRun}执行`, "success");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="券来首页">券来</a>
        <div className="service-status" role="status">
          <span className={`status-dot ${bridgeState}`} aria-hidden="true" />
          {bridgeState === "checking" ? "正在连接本地服务" : bridgeState === "ready" ? "官方 Skill 已连接" : "官方 Skill 未连接"}
        </div>
      </header>

      <main className="main-grid" id="main">
        <section className="intro" aria-labelledby="page-title">
          <div className="intro-copy">
            <p className="eyebrow">每天一次 · 自动执行</p>
            <h1 id="page-title">每天准时，<br />优惠券自己来</h1>
            <p className="lede">授权接入后，券来将在你设定的时间，自动为你领取当日可用优惠券。</p>
          </div>

          <div className="trust-list" aria-label="服务保障">
            <div className="trust-item"><ShieldCheck aria-hidden="true" /><span><strong>官方授权接口</strong><small>安全可靠</small></span></div>
            <div className="trust-divider" aria-hidden="true" />
            <div className="trust-item"><LockKey aria-hidden="true" /><span><strong>凭证仅保存在本地</strong><small>隐私更安心</small></span></div>
            <div className="trust-divider" aria-hidden="true" />
            <div className="trust-item"><Clock aria-hidden="true" /><span><strong>每日自动执行</strong><small>省心不遗漏</small></span></div>
          </div>

          <div className={`next-run ${active ? "is-active" : ""}`}>
            <CalendarBlank aria-hidden="true" />
            <span>下一次执行：<strong>{nextRun}</strong></span>
          </div>
        </section>

        <section className="setup" aria-label="自动领取设置">
          <Stepper step={step} />
          <form onSubmit={(event) => { event.preventDefault(); activate(); }} noValidate>
            <div className="field-group">
              <label htmlFor="phone">手机号</label>
              <div className="phone-row">
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="请输入手机号"
                  value={phone}
                  maxLength={11}
                  disabled={active}
                  aria-invalid={phone.length > 0 && !phoneValid}
                  onChange={(event) => {
                    setPhone(event.target.value.replace(/\D/g, "").slice(0, 11));
                    setVerified(false); setActive(false); setDigits(EMPTY_CODE); setCodeSent(false); setMessage("");
                  }}
                />
                <button type="button" className="secondary-button" onClick={requestCode} disabled={busy || countdown > 0 || active}>
                  {countdown > 0 ? `${countdown} 秒后重发` : busy ? "发送中…" : "获取验证码"}
                </button>
              </div>
            </div>

            <div className="field-group">
              <label>验证码</label>
              <OtpFields digits={digits} onChange={(value) => { setDigits(value); setVerified(false); }} disabled={!codeSent || active} />
            </div>

            <div className="field-group">
              <label htmlFor="time">每天执行时间</label>
              <div className="time-control"><Clock aria-hidden="true" /><input id="time" type="time" value={time} onChange={(event) => { setTime(event.target.value); setActive(false); }} disabled={active} /></div>
            </div>

            <button className="primary-button" type="submit" disabled={busy || active || bridgeState !== "ready"}>
              {active ? <><Check weight="bold" /> 已开启自动领取</> : busy ? "正在开启…" : "开启自动领取"}
            </button>

            <label className="consent">
              <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} disabled={active} />
              <span>我已阅读并同意<a href="https://open-pepper.meituan.com/eds/rules/meituan-coupon-skill-service-rule.html" target="_blank" rel="noreferrer">《美团红包助手 Skill 服务使用规则》</a></span>
            </label>
            <div className={`form-message ${messageType}`} role="status" aria-live="polite">
              {message}
              {securityUrl && <a className="security-link" href={securityUrl} target="_blank" rel="noreferrer">完成安全验证后重试</a>}
            </div>
          </form>
        </section>
      </main>

      <footer className="footer-note"><LockKey aria-hidden="true" /> 登录凭证由本机官方 Skill 管理，券来不会持久化或上传令牌</footer>
    </div>
  );
}
