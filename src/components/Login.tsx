import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = { initialError?: string }

export default function Login({ initialError = '' }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [submitError, setSubmitError] = useState(initialError)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim()
    const nextEmailError = !normalizedEmail
      ? 'El correo electrónico es obligatorio.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ? 'Escribe un correo electrónico válido.'
        : ''
    const nextPasswordError = password ? '' : 'La contraseña es obligatoria.'
    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)
    setSubmitError('')
    if (nextEmailError || nextPasswordError) return
    if (!supabase) {
      setSubmitError('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para iniciar sesión.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (error) {
        setSubmitError(/invalid login credentials/i.test(error.message)
          ? 'El correo o la contraseña son incorrectos.'
          : error.message)
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'No se pudo iniciar sesión. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-mark"><span /></div>
          <span>finora</span>
        </div>
        <div className="login-heading">
          <span className="login-eyebrow">TU ESPACIO FINANCIERO</span>
          <h1 id="login-title">Bienvenido de nuevo</h1>
          <p>Inicia sesión para continuar con tus finanzas.</p>
        </div>
        <form className="login-form" onSubmit={(event) => void submit(event)} noValidate>
          <label className="login-field">
            <span>Correo electrónico</span>
            <span className={`login-input-wrap ${emailError ? 'has-error' : ''}`}>
              <Mail size={17} aria-hidden="true" />
              <input
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => { setEmail(event.target.value); setEmailError(''); setSubmitError('') }}
                placeholder="nombre@empresa.com"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? 'login-email-error' : undefined}
              />
            </span>
            {emailError && <small id="login-email-error" className="login-field-error">{emailError}</small>}
          </label>
          <label className="login-field">
            <span>Contraseña</span>
            <span className={`login-input-wrap ${passwordError ? 'has-error' : ''}`}>
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => { setPassword(event.target.value); setPasswordError(''); setSubmitError('') }}
                placeholder="Tu contraseña"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'login-password-error' : undefined}
              />
            </span>
            {passwordError && <small id="login-password-error" className="login-field-error">{passwordError}</small>}
          </label>
          {submitError && <p className="login-submit-error" role="alert">{submitError}</p>}
          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Verificando…' : 'Iniciar sesión'}
            {!submitting && <ArrowRight size={17} />}
          </button>
        </form>
        <p className="login-footer">Acceso seguro a tu espacio de Finora</p>
      </section>
    </main>
  )
}
