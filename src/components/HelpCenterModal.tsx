import { Building2, Code2, MessageCircle, Phone, X } from 'lucide-react'

type Props = {
  connectionStatus: string
  onClose: () => void
}

export default function HelpCenterModal({ connectionStatus, onClose }: Props) {
  return (
    <div className="modal-overlay help-center-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="help-center-modal" role="dialog" aria-modal="true" aria-labelledby="help-center-title">
        <button className="icon-button help-center-close" onClick={onClose} aria-label="Cerrar centro de ayuda">
          <X size={19} />
        </button>
        <div className="help-center-brand">
          <div className="help-center-logo" aria-hidden="true"><Building2 size={26} /></div>
          <div>
            <div className="eyebrow">SOPORTE Y ASISTENCIA</div>
            <h2 id="help-center-title">SOLUCIONES INFORMATICAS LBC</h2>
          </div>
        </div>

        <div className="help-center-description">
          <div className="help-center-product"><Code2 size={17} /><strong>Finora</strong><span>Gestión financiera inteligente</span></div>
          <p>Sistema de Gestión Financiera Multidivisa para farmacias y comercios, optimizado para el control de cuentas y caja, el calendario de obligaciones y la generación de informes en Excel.</p>
        </div>

        <div className="help-center-contact">
          <h3>Contacto y soporte</h3>
          <div className="help-center-contact-row">
            <span className="help-center-contact-icon"><Phone size={16} /></span>
            <div><small>Teléfono</small><a href="tel:+59162108877">+591 62108877</a></div>
            <a className="help-center-whatsapp" href="https://wa.me/59162108877" target="_blank" rel="noreferrer" aria-label="Contactar por WhatsApp"><MessageCircle size={16} /><span>WhatsApp</span></a>
          </div>
          <div className="help-center-contact-row">
            <span className="help-center-contact-icon"><Code2 size={16} /></span>
            <div><small>Desarrollador / Responsable</small><strong>Ing. Luis Beltrán Condori Cano</strong></div>
          </div>
        </div>

        <div className="help-center-footer">
          <span>Finora · Versión 0.0.0</span>
          <span className={`help-center-status ${connectionStatus === 'Conectado a Supabase' ? 'is-connected' : 'is-pending'}`}>
            <i aria-hidden="true" />{connectionStatus}
          </span>
        </div>
      </section>
    </div>
  )
}
