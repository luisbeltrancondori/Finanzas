import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { AuthenticatedUserProfile } from '../services/financeService'

type Props = {
  profile: AuthenticatedUserProfile
  onClose: () => void
  onSave: (values: { name: string; photo?: File; currentPassword?: string; newPassword?: string }) => Promise<void>
}

export default function ProfileModal({ profile, onClose, onSave }: Props) {
  const [name, setName] = useState(profile.name)
  const [photo, setPhoto] = useState<File>()
  const [previewUrl, setPreviewUrl] = useState(profile.avatarUrl)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const previewObjectUrl = useRef<string | null>(null)

  useEffect(() => () => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    if (Boolean(currentPassword) !== Boolean(newPassword)) {
      setError('Ingresa la contraseña actual y la nueva contraseña para cambiarla.')
      return
    }
    if (newPassword && newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        name,
        photo,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo actualizar el perfil.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="modal-card profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div className="modal-heading"><div><div className="eyebrow">FINORA · PERFIL</div><h2 id="profile-modal-title">Editar perfil</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar" disabled={saving}><X size={20} /></button></div>
      <form onSubmit={(event) => void save(event)}>
        <div className="form-content profile-form-content">
          <div className="profile-photo-picker"><span className="profile-photo-preview">{previewUrl ? <img src={previewUrl} alt="Vista previa del perfil" /> : profile.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><label className="button-secondary">Cambiar foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
              setError('Selecciona una imagen PNG, JPG o WebP.')
              return
            }
            if (file.size > 5 * 1024 * 1024) {
              setError('La imagen no puede superar los 5 MB.')
              return
            }
            if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
            previewObjectUrl.current = URL.createObjectURL(file)
            setPreviewUrl(previewObjectUrl.current)
            setPhoto(file)
            setError('')
          }} /></label><small>PNG, JPG o WebP · Máx. 5 MB</small></div>
          <label className="form-field"><span>Nombre</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>
          <label className="form-field"><span>Correo electrónico</span><input value={profile.email} disabled /></label>
          <div className="profile-password-divider"><strong>Cambiar contraseña</strong><span>Deja ambos campos vacíos si no deseas cambiarla.</span></div>
          <label className="form-field"><span>Contraseña actual</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setError('') }} /></label>
          <label className="form-field"><span>Nueva contraseña</span><input type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError('') }} /></label>
        </div>
        {error && <p className="form-submit-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil'}</button></div>
      </form>
    </section>
  </div>
}
