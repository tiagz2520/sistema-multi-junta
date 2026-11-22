import { useState } from 'react';
import { Feedback } from './ui';

export function PropertyMap({
  latitud,
  longitud,
  nombre,
}: {
  latitud: string | null | undefined;
  longitud: string | null | undefined;
  nombre: string;
}) {
  const [showMap, setShowMap] = useState(false);

  if (latitud == null || longitud == null) {
    return (
      <Feedback>Este predio todavía no tiene coordenadas registradas.</Feedback>
    );
  }

  const latitude = Number(latitud);
  const longitude = Number(longitud);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return <Feedback>Las coordenadas registradas no son válidas.</Feedback>;
  }

  const point = `${latitude},${longitude}`;
  const externalUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(point)}&z=16&output=embed`;

  return (
    <div className="form-stack">
      <p className="muted text-sm">
        Latitud {latitud}° · Longitud {longitud}°
      </p>
      <p className="muted text-sm">
        Google Maps recibe las coordenadas cuando abres el enlace o activas la
        vista del mapa.
      </p>
      <div className="form-actions">
        <button
          className="button-secondary"
          type="button"
          aria-expanded={showMap}
          onClick={() => setShowMap((value) => !value)}
        >
          {showMap ? 'Ocultar mapa' : 'Mostrar mapa'}
        </button>
        <a
          className="button-secondary"
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir en Google Maps
        </a>
      </div>
      {showMap && (
        <>
          <iframe
            title={`Ubicación de ${nombre} en Google Maps`}
            src={embedUrl}
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{ width: '100%', minHeight: 320, border: 0 }}
          />
          <p className="muted text-sm">
            Si la vista integrada no se carga, utiliza «Abrir en Google Maps».
          </p>
        </>
      )}
    </div>
  );
}
