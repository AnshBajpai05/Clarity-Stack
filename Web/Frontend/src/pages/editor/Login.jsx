import React, { useState } from 'react';
import { supabase } from './supabaseClient';

const Login = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState({ text: '', ok: true });
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ text: '', ok: true });

    try {
      if (isSignUp) {
        if (!fullName.trim()) throw new Error('Please enter your full name.');
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        setMsg({ text: 'Account created! You can now log in.', ok: true });
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      {/* Left decorative panel */}
      <div style={s.left}>
        <div style={s.logo}>Clarity</div>
        <h2 style={s.tagline}>Real-time collaborative<br />writing, reimagined.</h2>
        <p style={s.sub}>Create, write, and collaborate on documents live— with full edit history and access control.</p>
        <div style={s.dots}>
          <span style={{ ...s.dot, backgroundColor: '#7c3aed' }} />
          <span style={{ ...s.dot, backgroundColor: '#4f46e5' }} />
          <span style={{ ...s.dot, backgroundColor: '#2563eb' }} />
        </div>
      </div>

      {/* Right form panel */}
      <div style={s.right}>
        <div style={s.card}>
          <h1 style={s.cardTitle}>{isSignUp ? 'Create account' : 'Welcome back'}</h1>
          <p style={s.cardSub}>{isSignUp ? 'Join Clarity and start collaborating' : 'Sign in to your Clarity workspace'}</p>

          <form onSubmit={handleAuth} style={s.form}>
            {isSignUp && (
              <Field label="Full Name" type="text" placeholder="Nishant Bajpai" value={fullName} onChange={setFullName} />
            )}
            <Field label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
            <Field label="Password" type="password" placeholder="••••••••" value={password} onChange={setPassword} />

            {msg.text && (
              <div style={{ ...s.msgBox, borderColor: msg.ok ? '#22c55e' : '#ef4444', color: msg.ok ? '#86efac' : '#fca5a5' }}>
                {msg.text}
              </div>
            )}

            <button type="submit" disabled={loading} style={s.btn}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <span style={s.spinner} /> {isSignUp ? 'Creating…' : 'Signing in…'}
                </span>
              ) : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <p style={s.toggle}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <span style={s.link} onClick={() => { setIsSignUp(!isSignUp); setMsg({ text: '', ok: true }); }}>
              {isSignUp ? 'Sign in' : 'Sign up'}
            </span>
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

const Field = ({ label, type, placeholder, value, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</label>
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)} required
      style={{ padding: '11px 14px', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', color: '#f9fafb', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' }}
      onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
      onBlur={(e) => e.target.style.borderColor = '#1f2937'}
    />
  </div>
);

const s = {
  page:     { display: 'flex', minHeight: '100vh', backgroundColor: '#030712', fontFamily: "'Inter', 'Segoe UI', sans-serif" },
  left:     { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px', background: 'linear-gradient(135deg, #0f0720 0%, #1e1b4b 50%, #0c1445 100%)', position: 'relative', overflow: 'hidden' },
  logo:     { fontSize: '28px', fontWeight: 900, color: '#a78bfa', letterSpacing: '-1px', marginBottom: '48px' },
  tagline:  { fontSize: '36px', fontWeight: 800, color: '#f9fafb', lineHeight: 1.25, marginBottom: '20px' },
  sub:      { fontSize: '16px', color: '#9ca3af', lineHeight: 1.7, maxWidth: '360px' },
  dots:     { display: 'flex', gap: '8px', marginTop: '48px' },
  dot:      { width: '10px', height: '10px', borderRadius: '50%' },

  right:    { width: '440px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', backgroundColor: '#030712' },
  card:     { width: '100%', maxWidth: '380px' },
  cardTitle:{ fontSize: '26px', fontWeight: 800, color: '#f9fafb', margin: '0 0 8px' },
  cardSub:  { fontSize: '14px', color: '#6b7280', marginBottom: '32px' },

  form:     { display: 'flex', flexDirection: 'column', gap: '18px' },
  msgBox:   { padding: '10px 14px', borderRadius: '8px', border: '1px solid', backgroundColor: 'transparent', fontSize: '13px' },
  btn:      { marginTop: '4px', padding: '13px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' },
  spinner:  { width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' },
  toggle:   { marginTop: '24px', fontSize: '13px', color: '#6b7280', textAlign: 'center' },
  link:     { color: '#a78bfa', cursor: 'pointer', fontWeight: 600 },
};

export default Login;
