interface Props {
  fps: number;
}

export default function FpsCounter({ fps }: Props) {
  const color =
    fps >= 30 ? '#22C55E' : fps >= 20 ? '#F59E0B' : '#EF4444';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        background: 'rgba(13,15,20,0.88)',
        border: '1px solid rgba(42,47,62,0.9)',
        borderRadius: 8,
        padding: '6px 14px',
        display: 'flex',
        alignItems: 'baseline',
        gap: 5,
        backdropFilter: 'blur(6px)',
        zIndex: 10,
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          color,
          fontFamily: 'monospace',
          lineHeight: 1,
          minWidth: 28,
          textAlign: 'right',
        }}
      >
        {fps}
      </span>
      <span
        style={{
          fontSize: 10,
          color: '#5A6070',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}
      >
        FPS
      </span>
    </div>
  );
}