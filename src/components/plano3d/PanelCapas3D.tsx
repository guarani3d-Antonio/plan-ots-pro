interface Props {
  layers: string[];
  visible: boolean[];
  onToggle: (index: number, visible: boolean) => void;
  onVerDetalle: () => void;
}

export default function PanelCapas3D({
  layers,
  visible,
  onToggle,
  onVerDetalle,
}: Props) {
  return (
    <aside
      style={{
        width: 248,
        flexShrink: 0,
        background: '#1E2230',
        borderLeft: '1px solid #2A2F3E',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 16px',
      }}
    >
      {/* Título */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          color: '#5A6070',
          marginBottom: 14,
        }}
      >
        Capas del modelo
      </div>

      {/* Checkboxes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {layers.map((name, i) => (
          <label
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 11px',
              background: visible[i]
                ? 'rgba(204,122,0,0.09)'
                : 'rgba(90,96,112,0.06)',
              borderRadius: 7,
              cursor: 'pointer',
              transition: 'background 0.15s',
              border: visible[i]
                ? '1px solid rgba(204,122,0,0.2)'
                : '1px solid transparent',
            }}
          >
            <input
              type="checkbox"
              checked={visible[i]}
              onChange={(e) => onToggle(i, e.target.checked)}
              style={{ accentColor: '#CC7A00', width: 15, height: 15, cursor: 'pointer' }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: visible[i] ? '#F0E6D3' : '#5A6070',
                transition: 'color 0.15s',
              }}
            >
              {name}
            </span>
          </label>
        ))}
      </div>

      {/* Separador */}
      <div style={{ height: 1, background: '#2A2F3E', margin: '20px 0' }} />

      {/* Indicador de marcador */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '8px 11px',
          background: 'rgba(204,122,0,0.07)',
          borderRadius: 7,
          border: '1px solid rgba(204,122,0,0.18)',
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#CC7A00',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, color: '#F0E6D3', fontWeight: 600 }}>
          OT-3D-DEMO
        </span>
      </div>

      {/* Botón ver detalle */}
      <button
        onClick={onVerDetalle}
        style={{
          padding: '11px 16px',
          background: '#CC7A00',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          width: '100%',
          letterSpacing: '0.02em',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        Ver detalle OT →
      </button>
    </aside>
  );
}