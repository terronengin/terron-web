"use client";

export type MapOverlayPanelProps = {
  title: string;
  breadcrumb: string;
  subtitle: string;
  showBack: boolean;
  onBack: () => void;
};

export function MapOverlayPanel({ title, breadcrumb, subtitle, showBack, onBack }: MapOverlayPanelProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        maxWidth: "min(92vw, 320px)",
        padding: "8px 10px",
        borderRadius: 14,
        background: "linear-gradient(145deg, rgba(12,16,28,0.78) 0%, rgba(8,10,18,0.72) 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(12px) saturate(1.2)",
        WebkitBackdropFilter: "blur(12px) saturate(1.2)",
        color: "rgba(255,255,255,0.96)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {showBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Geri"
          style={{
            flexShrink: 0,
            marginTop: 1,
            width: 28,
            height: 28,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
          }}
        >
          ←
        </button>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
          lineHeight: 1.2,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.02em",
            fontFeatureSettings: '"salt" 1',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            opacity: 0.72,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={breadcrumb}
        >
          {breadcrumb}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.88, marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  );
}
