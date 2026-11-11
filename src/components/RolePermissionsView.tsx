import { useEffect, useMemo, useState } from 'react'
import { Check, LockKeyhole, Save, ShieldCheck } from 'lucide-react'
import { listRoles, type UserRole } from '../services/userService'
import { getAllPermissions, getPermissionsByRole, updateRolePermissions, type Permission } from '../services/permissionService'
import type { DatabaseId } from '../types/finance'

const administratorRoleId = '1'

export default function RolePermissionsView() {
  const [roles, setRoles] = useState<UserRole[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<DatabaseId[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    let active = true
    void Promise.all([listRoles(), getAllPermissions()])
      .then(([nextRoles, nextPermissions]) => {
        if (!active) return
        setRoles(nextRoles)
        setPermissions(nextPermissions)
        if (nextRoles.length) setLoading(true)
        setSelectedRoleId(nextRoles[0]?.id ?? '')
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los roles y permisos.')
          setLoading(false)
        }
      })
    return () => { active = false }
  }, [reloadVersion])

  useEffect(() => {
    if (!selectedRoleId) return
    let active = true
    void getPermissionsByRole(selectedRoleId)
      .then((ids) => {
        if (!active) return
        setSelectedPermissionIds(ids)
        setLoading(false)
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los permisos del rol.')
          setLoading(false)
        }
      })
    return () => { active = false }
  }, [selectedRoleId, reloadVersion])

  const isAdministrator = selectedRoleId === administratorRoleId
  const selectedIds = isAdministrator ? permissions.map((permission) => permission.id) : selectedPermissionIds
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>()
    for (const permission of permissions) {
      const group = groups.get(permission.module) ?? []
      group.push(permission)
      groups.set(permission.module, group)
    }
    return [...groups.entries()]
  }, [permissions])

  const togglePermission = (permissionId: DatabaseId) => {
    if (isAdministrator) return
    setSelectedPermissionIds((current) => current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId])
    setNotice('')
  }

  const selectRole = (roleId: string) => {
    setLoading(true)
    setError('')
    setNotice('')
    setSelectedPermissionIds([])
    setSelectedRoleId(roleId)
  }

  const retry = () => {
    setLoading(true)
    setError('')
    setReloadVersion((version) => version + 1)
  }

  const save = async () => {
    if (!selectedRoleId) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await updateRolePermissions(selectedRoleId, selectedIds)
      setNotice('Los permisos del rol se guardaron correctamente.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudieron guardar los permisos.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="permissions-page">
      <div className="permissions-intro panel">
        <span className="permissions-intro-icon"><ShieldCheck size={20} /></span>
        <div><h2>Matriz de permisos</h2><p>Controla las acciones que puede realizar cada rol en los módulos de Finora.</p></div>
      </div>
      <section className="panel permissions-panel">
        <div className="permissions-toolbar">
          <label className="permissions-role-select"><span>Rol a configurar</span><select value={selectedRoleId} onChange={(event) => selectRole(event.target.value)} disabled={loading || !roles.length}><option value="">Selecciona un rol</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          {isAdministrator && <span className="permissions-lock-note"><LockKeyhole size={14} /> El Administrador siempre conserva todos los permisos.</span>}
        </div>
        {error && <div className="users-error" role="alert">{error}<button onClick={retry}>Reintentar</button></div>}
        {notice && <p className="permissions-success" role="status"><Check size={15} />{notice}</p>}
        {loading ? <div className="users-state"><span className="loading-spinner" /> Cargando matriz de permisos…</div> : !permissions.length ? <p className="users-empty">No hay permisos registrados en la tabla permiso.</p> : (
          <div className="permission-groups">
            {groupedPermissions.map(([module, modulePermissions]) => (
              <section className="permission-module" key={module}>
                <div className="permission-module-heading"><h3>Módulo {module}</h3><span>{modulePermissions.filter((permission) => selectedIds.includes(permission.id)).length} / {modulePermissions.length}</span></div>
                <div className="permission-items">
                  {modulePermissions.map((permission) => {
                    const checked = selectedIds.includes(permission.id)
                    return <label className={`permission-item ${isAdministrator ? 'permission-locked' : ''}`} key={permission.id}>
                      <input type="checkbox" checked={checked} disabled={isAdministrator || saving} onChange={() => togglePermission(permission.id)} />
                      <span className="permission-check">{checked && <Check size={13} />}</span>
                      <span className="permission-copy"><strong>{permission.name}</strong>{permission.description && permission.description !== permission.name && <small>{permission.description}</small>}</span>
                    </label>
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        <div className="permissions-footer"><span>{selectedIds.length} de {permissions.length} permisos seleccionados</span><button className="button-primary" onClick={() => void save()} disabled={loading || saving || !selectedRoleId || !permissions.length}><Save size={15} />{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
      </section>
    </section>
  )
}
