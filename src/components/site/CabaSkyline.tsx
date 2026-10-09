/**
 * Ilustración de línea de Buenos Aires: el Río de la Plata, Puerto Madero con
 * el Puente de la Mujer, el Obelisco, el Palacio Barolo y la Facultad de
 * Ingeniería. Trazo fino en rosé sobre azul noche (decorativa).
 */
export function CabaSkyline({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 720 150" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <g stroke="var(--color-rose-light)" strokeOpacity="0.55" strokeWidth="1.5">
        {/* edificios de fondo */}
        <path d="M8 132V96h26v36M40 132V78h22v54M68 132V104h18v28M92 132V70h30v62M128 132V92h20v40" />
        <path d="M600 132V88h22v44M628 132V64h28v68M662 132V98h18v34M686 132V82h26v50" />
        {/* Facultad de Ingeniería (neogótica) */}
        <path d="M160 132V86l14-16 14 16v46M174 70V56M166 100h16M166 114h16" />
        {/* Palacio Barolo */}
        <path d="M222 132V74h34v58M228 74V60h22v14M233 60V48h12v12M239 48V30" />
        <path d="M228 88h22M228 102h22M228 116h22" strokeOpacity="0.35" />
        {/* Obelisco */}
        <path stroke="var(--color-rose-light)" strokeOpacity="0.9" d="M330 132l6-104 4-10 4 10 6 104M336 110h8" />
        <path d="M300 132h82" />
        {/* Torres de Puerto Madero */}
        <path d="M418 132V58h26v74M450 132V44l14-6 14 6v88M486 132V72h22v60" />
        <path d="M456 60h16M456 76h16M456 92h16M456 108h16" strokeOpacity="0.35" />
        {/* Puente de la Mujer */}
        <path stroke="var(--color-rose-light)" strokeOpacity="0.9" d="M520 128h70M548 128l14-58M562 70c-4 20-6 40-4 58M548 128l14-22M552 128l10-38" />
      </g>
      {/* río */}
      <g stroke="var(--color-rose-light)" strokeOpacity="0.3" strokeWidth="1.5">
        <path d="M0 136c30 0 30 4 60 4s30-4 60-4 30 4 60 4 30-4 60-4 30 4 60 4 30-4 60-4 30 4 60 4 30-4 60-4 30 4 60 4 30-4 60-4 30 4 60 4 30-4 60-4" />
        <path
          d="M40 146c30 0 30-3 60-3s30 3 60 3 30-3 60-3 30 3 60 3 30-3 60-3 30 3 60 3 30-3 60-3 30 3 60 3 30-3 60-3 30 3 60 3"
          strokeOpacity="0.18"
        />
      </g>
    </svg>
  );
}
