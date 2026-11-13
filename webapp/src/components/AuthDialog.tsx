import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { capabilitiesSchema } from '@investing-hub/shared/mobile';
import type { z } from 'zod';
import type { AccountStore } from '../lib/accounts';
import { i18n, userError } from '../lib/i18n';

export function AuthDialog({
  store,
  capabilities,
  retry,
  onClose,
}: {
  store: AccountStore;
  capabilities?: z.infer<typeof capabilitiesSchema>;
  retry: () => void;
  onClose: () => void;
}) {
  useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<'login' | 'register' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    alive.current = true;
    if (!previousFocus.current)
      previousFocus.current = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {
      alive.current = false;
      element.close();
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);
  function change(next: typeof view) {
    setView(next);
    setError('');
    setMessage('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      setError('common:errors.INVALID_REQUEST');
      return;
    }
    const data = new FormData(form);
    setPending(true);
    setError('');
    setMessage('');
    try {
      if (view === 'login') {
        await store.login({ email, password: String(data.get('password')) });
        onClose();
      } else if (view === 'register') {
        await store.register({
          email,
          password: String(data.get('password')),
          firstName: String(data.get('firstName')),
          lastName: String(data.get('lastName')),
        });
        if (alive.current) {
          setView('verify');
          setMessage('accounts.codeSent');
        }
      } else {
        await store.verify({ email, verificationCode: String(data.get('verificationCode')) });
        if (alive.current) {
          setView('login');
          setMessage('accounts.verified');
        }
      }
    } catch (reason) {
      if (alive.current) setError(userError(reason));
    } finally {
      if (alive.current) {
        setPending(false);
        const password = form.querySelector<HTMLInputElement>('[name=password]');
        if (password) password.value = '';
      }
    }
  }
  const available = capabilities?.accounts === true;
  return (
    <dialog
      ref={dialog}
      className="transaction-dialog auth-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="auth-title"
    >
      <div className="dialog-heading">
        <h2 id="auth-title">{i18n.t(`accounts.${view}`)}</h2>
        <button
          className="icon-button"
          aria-label={i18n.t('common:action.close')}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="muted">{i18n.t('accounts.optional')}</p>
      <p className="muted">{i18n.t('accounts.memorySession')}</p>
      <div className="auth-tabs" aria-label={i18n.t('common:nav.account')}>
        {(['login', 'register', 'verify'] as const).map((step) => (
          <button
            key={step}
            className="button secondary"
            type="button"
            aria-pressed={view === step}
            disabled={pending || (step === 'register' && !capabilities?.registration)}
            onClick={() => change(step)}
          >
            {i18n.t(`accounts.${step}`)}
          </button>
        ))}
      </div>
      {!available && (
        <div className="notice" role="status">
          {i18n.t('accounts.unavailable')}{' '}
          <button className="text-button" onClick={retry}>
            {i18n.t('common:action.retry')}
          </button>
        </div>
      )}
      {available && !capabilities.registration && (
        <p className="notice" role="status">
          {i18n.t('accounts.registrationDisabled')}
        </p>
      )}
      <form onSubmit={submit} noValidate>
        <fieldset
          className="auth-fields"
          disabled={pending || !available || (view === 'register' && !capabilities?.registration)}
        >
          {view === 'register' && (
            <div className="form-grid">
              <label>
                {i18n.t('accounts.firstName')}
                <input name="firstName" autoComplete="given-name" required maxLength={60} />
              </label>
              <label>
                {i18n.t('accounts.lastName')}
                <input name="lastName" autoComplete="family-name" required maxLength={60} />
              </label>
            </div>
          )}
          <label>
            {i18n.t('accounts.email')}
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
            />
          </label>
          {view === 'verify' ? (
            <label>
              {i18n.t('accounts.code')}
              <input
                name="verificationCode"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
            </label>
          ) : (
            <label>
              {i18n.t('accounts.password')}
              <input
                key={view}
                name="password"
                type="password"
                autoComplete={view === 'register' ? 'new-password' : 'current-password'}
                required
                minLength={view === 'register' ? 12 : 1}
                maxLength={72}
                aria-describedby={view === 'register' ? 'password-hint' : undefined}
              />
            </label>
          )}
          {view === 'register' && (
            <small id="password-hint">{i18n.t('accounts.passwordHint')}</small>
          )}
          <button className="button primary" type="submit">
            {i18n.t(pending ? 'accounts.working' : `accounts.${view}`)}
          </button>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {i18n.t(error)}
          </p>
        )}
        {message && (
          <p className="feedback" role="status">
            {i18n.t(message)}
          </p>
        )}
      </form>
      <button className="text-button" onClick={onClose}>
        {i18n.t('accounts.continueGuest')}
      </button>
    </dialog>
  );
}
