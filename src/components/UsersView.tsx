import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
import { createUser, deleteUser, listRoles, listUsers, updateUser, type ManagedUser, type UserRole } from '../services/userService'
import type { DatabaseId } from '../types/finance'

type Props = { currentUserId: DatabaseId }
type FormValues = { name: string; email: string; password: string; roleId: string; active: boolean }
const emptyValues: FormValues = { name: '', email: '', password: '', roleId: '', active: true }

export default function UsersView({ currentUserId }: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextUsers, nextRoles] = await Promise.all([listUsers(), listRoles()])
      setUsers(nextUsers)
      setRoles(nextRoles)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [])

  const openNew = () => {
    setEditing(null)
    setValues({ ...emptyValues, roleId: roles[0]?.id ?? '' })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (user: ManagedUser) => {
    setEditing(user)
    setValues({ name: user.name, email: user.email, password: '', roleId: user.roleId, active: user.active })
    setFormError('')
    setModalOpen(true)
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!values.name.trim() || !values.email.trim() || !values.roleId || (!editing && !values.password)) {
      setFormError('Completa el nombre, el correo, la contraseña y el rol.')
      return
    }
    if (!editing && values.password.length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const record = {
        nombre: values.name.trim(),
        correo: values.email.trim(),
        rol_id: values.roleId,
        estado: values.active,
      }
      if (editing) await updateUser(editing.id, record)
      else await createUser({ ...record, password: values.password })
      setModalOpen(false)
      await load()
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el usuario.')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (user: ManagedUser) => {
    if (user.id === currentUserId) {
      setError('No puedes inactivar tu propio usuario mientras tienes la sesión abierta.')
      return
    }
    if (!window.confirm(`¿Inactivar a ${user.name}? Podrás reactivarlo editando su estado.`)) return
    setError('')
    try {
      await deleteUser(user.id)
      await load()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo inactivar el usuario.')
    }
  }

  const visibleUsers = users.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <section className="users-page">
      <div className="users-toolbar">
        <div className="users-intro"><span className="users-icon"><ShieldCheck size={19} /></span><div><h2>Usuarios y permisos</h2><p>Administra los usuarios y los roles con acceso a Finora.</p></div></div>
        <button className="button-primary" onClick={openNew} disabled={!roles.length}><Plus size={16} /> Nuevo usuario</button>
      </div>
      <section className="panel users-panel">
        <div className="users-table-heading">
          <div><h2>Usuarios registrados</h2><p>{users.length} usuarios en el sistema</p></div>
          <label className="users-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuario…" aria-label="Buscar usuario" /></label>
        </div>
        {error && <div className="users-error" role="alert">{error}<button onClick={() => void load()}>Reintentar</button></div>}
        {loading ? <div className="users-state"><span className="loading-spinner" /> Cargando usuarios…</div> : (
          <div className="table-scroll">
            <table className="users-table">
              <thead><tr><th>USUARIO</th><th>CORREO</th><th>ROL</th><th>ESTADO</th><th aria-label="Acciones" /></tr></thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td><span className="users-name"><span className="users-avatar"><UserRound size={15} /></span><strong>{user.name}</strong></span></td>
                    <td>{user.email}</td>
                    <td><span className="users-role">{user.role}</span></td>
                    <td><span className={`user-status ${user.active ? 'active' : ''}`}><i />{user.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td><div className="users-actions"><button className="icon-button" onClick={() => openEdit(user)} aria-label={`Editar ${user.name}`} title="Editar"><Pencil size={15} /></button><button className="icon-button" onClick={() => void deactivate(user)} disabled={!user.active} aria-label={`Inactivar ${user.name}`} title="Inactivar"><Trash2 size={15} /></button></div></td>
                  </tr>
                ))}
                {!visibleUsers.length && <tr><td className="users-empty" colSpan={5}>{users.length ? 'No hay usuarios que coincidan con la búsqueda.' : 'Todavía no hay usuarios registrados.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false) }}>
        <section className="modal-card users-modal" role="dialog" aria-modal="true" aria-labelledby="users-modal-title">
          <div className="modal-heading"><div><div className="eyebrow">FINORA · ACCESOS</div><h2 id="users-modal-title">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h2></div><button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Cerrar" disabled={saving}><X size={20} /></button></div>
          <form onSubmit={(event) => void save(event)}>
            <div className="form-content"><div className="form-grid">
              <label className="form-field"><span>Nombre</span><input autoFocus value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder="Nombre completo" /></label>
              <label className="form-field"><span>Correo electrónico</span><input type="email" required autoComplete="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} placeholder="nombre@empresa.com" /></label>
              {!editing && <label className="form-field"><span>Contraseña</span><input type="password" required minLength={6} autoComplete="new-password" value={values.password} onChange={(event) => { setValues({ ...values, password: event.target.value }); setFormError('') }} placeholder="Mínimo 6 caracteres" /></label>}
              <label className="form-field"><span>Rol</span><select value={values.roleId} onChange={(event) => setValues({ ...values, roleId: event.target.value })}><option value="">Selecciona un rol</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              <label className="user-active-field"><input type="checkbox" checked={values.active} onChange={(event) => setValues({ ...values, active: event.target.checked })} /><span>Usuario activo</span></label>
            </div></div>
            {formError && <p className="form-submit-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button><button className="button-primary" disabled={saving || !roles.length}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear usuario'}</button></div>
          </form>
        </section>
      </div>}
    </section>
  )
}
