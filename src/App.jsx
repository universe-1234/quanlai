import { useEffect, useRef, useState } from "react";
import { Clock, LockKey } from "@phosphor-icons/react";
import { couponApi, getNextRunLabel } from "./api.js";

const EMPTY_CODE = Array(6).fill("");

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
  const [status, setStatus] = useState(null);
  const [runs, setRuns] = useState([]);
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(EMPTY_CODE);
  const [time, setTime] = useState('00:00');
  const [dirtyTime, setDirtyTime] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [loginForm, setLoginForm] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [securityUrl, setSecurityUrl] = useState('');
  const mounted = useRef(true);
  const polling = useRef(false);
  const dirty = useRef(false);
  const operation = useRef(false);
  const stopping = useRef(false);
  const [closing, setClosing] = useState(false);
  const refresh = async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const result = await couponApi.status();
      const history = await couponApi.runs();
      if (!mounted.current) return;
      setStatus(result); setRuns(history.runs); setError('');
      if (!dirty.current) setTime(result.schedule.time);
    } catch (e) { if (mounted.current) setError(e.message); }
    finally { polling.current = false; }
  };
  useEffect(() => {
    mounted.current = true; refresh();
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const timer = setInterval(refresh, status?.running || busy === 'issue' ? 1500 : 10000);
    return () => clearInterval(timer);
  }, [status?.running, busy]);
  useEffect(() => {
    if (!countdown) return;
    const timer = setTimeout(() => setCountdown(n => Math.max(0, n-1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);
  const loggedIn = !!status?.bridge.loggedIn;
  const enabled = !!status?.schedule.enabled;
  const running = !!status?.running || busy === 'issue';
  const unavailable = !status?.bridge.available;
  const showLogin = loginForm || (status && !loggedIn);
  const execute = async (name, action) => {
    if (operation.current) return;
    operation.current = true; setBusy(name); setMessage(''); setSecurityUrl('');
    try { await action(); }
    catch (e) { setMessage(e.message); setSecurityUrl(e.redirectUrl || ''); }
    finally { operation.current = false; setBusy(''); await refresh(); }
  };
  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true; setClosing(true);
    try {
      const result = await couponApi.saveSchedule(time, false);
      setMessage(result.warning || '自动领取已关闭。已经开始的领取仍可能完成。');
    } catch (e) { setMessage(e.message); }
    finally { stopping.current = false; setClosing(false); await refresh(); }
  };
  const save = enabledValue => enabledValue ? execute('schedule', async () => {
    const result = await couponApi.saveSchedule(time, enabledValue);
    dirty.current = false; setDirtyTime(false);
    setMessage(result.warning || (enabledValue ? '自动领取已开启。当天错过时间时会补领一次。' : '自动领取已关闭。已经开始的领取仍可能完成。'));
  }) : stop();
  const issue = () => execute('issue', async () => {
    const result = await couponApi.issue();
    setMessage(result.ok ? `领取完成，本次返回 ${result.couponCount ?? 0} 张券。` : result.error?.message || '领取未完成，请查看执行记录。');
  });
  const latest = runs[0];
  const labels = { running: '执行中', success: '领取成功', failed: '领取失败', interrupted: '执行中断' };
  return (
    <div className="app-shell">
      <header className="topbar"><a className="brand" href="#main">券来</a><div className="service-status" role="status"><span className={`status-dot ${error || unavailable ? 'unavailable' : ''}`} aria-hidden="true" />{!status ? '连接本地服务' : unavailable ? '领取组件未连接' : '本地服务已连接'}</div></header>
      <main className="workspace" id="main">
        <section className="workspace-intro"><p className="workspace-eyebrow">本地运行 · 每天一次</p><h1>领取有安排，<br />结果看得见。</h1><p className="lede">设置每日时间，让券来替你完成重复操作。执行状态和结果都保留在这台电脑上。</p><p className="muted">非美团官方产品 · 登录和领券由第三方发布的美团红包助手 Skill 提供。</p></section>
        {error && <div className="notice danger" role="alert"><strong>暂时无法读取状态</strong><p>{error}</p><button className="secondary-button" onClick={refresh}>重新连接</button><button className="secondary-button" disabled={closing || (!!busy && busy !== 'issue')} onClick={() => save(false)}>关闭自动领取</button></div>}
        {!status && !error && <p role="status">正在读取账号与自动任务…</p>}
        {status && <>
          <div className="summary-grid">
            <section className="panel"><span className="panel-label">账号状态</span><h2>{loggedIn ? '已登录' : '需要登录'}</h2><p>{loggedIn ? status.bridge.phoneMasked || '本机账号已连接' : '登录后即可领取与设置自动任务。'}</p><button className="text-button" disabled={!!busy || running} onClick={() => setLoginForm(v => !v)}>{loggedIn ? '重新登录' : '手机验证'}</button></section>
            <section className="panel"><span className="panel-label">自动领取</span><h2>{status.systemSchedule.state === 'mismatch' || status.systemSchedule.state === 'error' ? '任务需要处理' : enabled ? '已开启' : '已关闭'}</h2><p>{enabled ? `每日 ${status.schedule.time}` : '开启后，在设定时间执行。'}</p><p className="muted">下次执行：{getNextRunLabel(status.nextRunAt)}</p></section>
            <section className="panel"><span className="panel-label">最近一次</span><h2>{latest ? labels[latest.status] : '还没有记录'}</h2><p>{latest ? getNextRunLabel(latest.startedAt) : '首次执行后会在这里显示结果。'}</p><p className="muted">{latest?.status === 'success' ? `返回 ${latest.couponCount} 张券，不代表实际节省金额。` : latest?.error?.message || '每次结果均可在下方查看。'}</p></section>
          </div>
          {showLogin && <section className="panel login-panel" aria-labelledby="login-heading"><h2 id="login-heading">手机号验证</h2><p className="muted">凭证由本机领取组件管理，验证码不写入设置或执行记录。</p><form onSubmit={e => { e.preventDefault(); execute('verify', async () => { await couponApi.verifyOtp(phone, digits.join('')); setLoginForm(false); setDigits(EMPTY_CODE); setCodeSent(false); setMessage('登录成功。'); }); }}>
            <label htmlFor="phone">手机号</label><div className="phone-row"><input id="phone" type="tel" inputMode="numeric" autoComplete="tel" maxLength={11} value={phone} disabled={!!busy} placeholder="请输入 11 位手机号" onChange={e => { setPhone(e.target.value.replace(/\D/g,'').slice(0,11)); setCodeSent(false); setDigits(EMPTY_CODE); }} /><button type="button" className="secondary-button" disabled={!!busy || countdown > 0 || !/^1\d{10}$/.test(phone) || !termsAccepted || unavailable} onClick={() => execute('otp', async () => { const r = await couponApi.requestOtp(phone, termsAccepted); setCodeSent(true); setCountdown(r.retryAfter || 60); setMessage('验证码已发送，请查看短信。倒计时表示再次发送的等待时间。'); })}>{countdown ? `${countdown} 秒后重发` : '获取验证码'}</button></div>
            <label className="consent"><input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} /><span>我已阅读并同意<a href="https://open-pepper.meituan.com/eds/rules/meituan-coupon-skill-service-rule.html" target="_blank" rel="noreferrer">服务使用规则</a></span></label>
            <p id="otp-label">六位短信验证码</p><OtpFields digits={digits} onChange={setDigits} disabled={!codeSent || !!busy} /><button className="primary-button" disabled={!!busy || !codeSent || digits.join('').length !== 6}>{busy === 'verify' ? '验证中…' : '验证并登录'}</button>
          </form></section>}
          <section className="panel control-panel" aria-labelledby="schedule-heading"><div><h2 id="schedule-heading">每日安排</h2><p className="muted">需要电脑开机、联网并登录 Windows。当天恢复后补领一次；失败后请手动重试。</p>{status.systemSchedule.provider === 'in-process' && <p className="notice">当前系统需要保持应用运行，关闭窗口后不会自动执行。</p>}</div><label htmlFor="time">每天执行时间</label><div className="control-actions"><input id="time" type="time" value={time} disabled={!!busy} onChange={e => { setTime(e.target.value); dirty.current = true; setDirtyTime(true); }} /><button className="primary-button" disabled={!!busy || !loggedIn || unavailable} onClick={() => save(true)}>{busy === 'schedule' ? '正在保存…' : enabled ? dirtyTime ? '保存时间' : '修复 / 确认任务' : '开启自动领取'}</button><button className="secondary-button" disabled={closing || (!!busy && busy !== 'issue')} onClick={() => save(false)}>关闭自动领取</button><button className="secondary-button" disabled={!!busy || running || !loggedIn || unavailable} onClick={issue}>{running ? '正在领取…' : latest?.status === 'failed' || latest?.status === 'interrupted' ? '手动重试' : '立即领取'}</button></div>{status.systemSchedule.cleanupPending && <p className="notice danger">已禁止自动领取，但系统任务清理失败。请再次点击“关闭自动领取”。</p>}</section>
        </>}
        <div className="operation-message" role="status" aria-live="polite">{message}{securityUrl && <a href={securityUrl} target="_blank" rel="noreferrer">完成安全验证后重试</a>}</div>
        <section className="panel history-panel" aria-labelledby="history-heading"><div className="section-title"><h2 id="history-heading">执行记录</h2><span className="muted">仅存本机 · 最近 100 次</span></div>{runs.length === 0 ? <div className="empty-state"><Clock aria-hidden="true" /><p>暂时没有执行记录</p><span className="muted">你可以先登录，再点击“立即领取”。</span></div> : <ol className="run-list">{runs.map(run => <li key={run.id}><div className="run-heading"><strong className={`run-state ${run.status}`}>{labels[run.status]}</strong><span>{run.source === 'automatic' ? '自动领取' : '手动领取'}</span><time dateTime={run.startedAt}>{getNextRunLabel(run.startedAt)}</time></div>{run.error && <p className="error-copy">{run.error.message}</p>}{run.status === 'success' && <p>本次返回 {run.couponCount} 张券</p>}{run.coupons?.length > 0 && <details><summary>查看券信息</summary><ul className="coupon-list">{run.coupons.map((c,i) => <li key={i}><strong>{c.name || c.title || c.coupon_name || '优惠券'}</strong>{(c.amount || c.face_value || c.discount_amount) && <span>面额：{c.amount || c.face_value || c.discount_amount}</span>}{(c.threshold || c.use_condition) && <span>门槛：{c.threshold || c.use_condition}</span>}{(c.valid_until || c.expire_time || c.validity || c.valid_end) && <span>有效期：{c.valid_until || c.expire_time || c.validity || [c.valid_start, c.valid_end].filter(Boolean).join(" 至 ")}</span>}</li>)}</ul></details>}</li>)}</ol>}</section>
      </main><footer className="footer-note"><LockKey aria-hidden="true" /> 不保证优惠券数量或长期可用性 · 不收集使用遥测</footer>
    </div>
  );
}
