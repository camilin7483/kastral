'use client';

import React, { useEffect } from 'react';

interface AdSenseSlotProps {
  slotId: string;
  format?: 'auto' | 'horizontal' | 'rectangle';
  className?: string;
}

/**
 * Espacio publicitario compatible con las políticas de Google AdSense.
 * Reglas estrictas del modelo de negocio:
 * 1. Si NEXT_PUBLIC_DISABLE_ADS === "true" (por defecto en desarrollo), no renderiza nada.
 * 2. Nunca inventa anuncios falsos, banners simulados, clics ni estadísticas.
 * 3. Solo carga el bloque <ins class="adsbygoogle"> real cuando se configura un
 *    NEXT_PUBLIC_ADSENSE_CLIENT_ID válido (ca-pub-...) y NEXT_PUBLIC_ADSENSE_APPROVED === "true".
 * 4. Se ubica siempre separado de la zona de carga y de los botones de descarga.
 */
export function AdSenseSlot({ slotId, format = 'auto', className = '' }: AdSenseSlotProps) {
  const disableAds = process.env.NEXT_PUBLIC_DISABLE_ADS !== 'false';
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || '';
  const isApproved = process.env.NEXT_PUBLIC_ADSENSE_APPROVED === 'true';

  const hasValidClient = /^ca-pub-\d{10,20}$/.test(clientId);
  const shouldRenderRealAd = !disableAds && isApproved && hasValidClient && Boolean(slotId);

  useEffect(() => {
    if (!shouldRenderRealAd) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      // Ignorar bloqueadores de anuncios del navegador del usuario sin romper la interfaz
    }
  }, [shouldRenderRealAd]);

  if (!shouldRenderRealAd) {
    return null;
  }

  return (
    <aside
      aria-label="Espacio publicitario"
      className={`my-10 max-w-4xl mx-auto px-4 py-3 border border-zinc-200/80 dark:border-zinc-800/80 rounded-lg bg-zinc-50/60 dark:bg-zinc-900/40 ${className}`}
    >
      <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-1.5 text-center select-none">
        Publicidad
      </div>
      <ins
        className="adsbygoogle block"
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </aside>
  );
}
