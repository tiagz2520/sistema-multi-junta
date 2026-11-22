import type { Actividad, TipoActividad } from '@multi-junta/api-client';
import { useState } from 'react';
import { activityTypes, timeLabel } from './records';

type Option = Pick<Actividad, 'id' | 'tipo' | 'titulo' | 'inicio' | 'estado'>;

interface ActivityPickerProps {
  activities: Option[];
  name?: string;
  value?: string;
  onChange?: (id: string) => void;
  closedOnly?: boolean;
}

export function ActivityPicker({
  activities,
  name,
  value,
  onChange,
  closedOnly = false,
}: ActivityPickerProps) {
  const [kind, setKind] = useState<TipoActividad | ''>('');
  const [localValue, setLocalValue] = useState('');
  const selection = value ?? localValue;
  const available = activities.filter(
    (activity) => !closedOnly || activity.estado === 'CERRADA',
  );
  const filtered = available.filter(
    (activity) => !kind || activity.tipo === kind,
  );

  function select(next: string) {
    setLocalValue(next);
    onChange?.(next);
  }

  return (
    <div className="activity-picker">
      <label>
        Tipo de actividad
        <select
          aria-label="Filtrar por tipo de actividad"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as TipoActividad | '');
            select('');
          }}
        >
          <option value="">Asambleas y mingas</option>
          {activityTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {closedOnly ? 'Actividad cerrada' : 'Actividad programada'}
        <select
          name={name}
          value={selection}
          required
          onChange={(event) => select(event.target.value)}
        >
          <option value="">Selecciona una actividad</option>
          {filtered.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.titulo} · {timeLabel(activity.inicio)}
            </option>
          ))}
        </select>
      </label>
      {filtered.length === 0 && (
        <p className="activity-picker-note" role="status">
          {available.length === 0
            ? closedOnly
              ? 'Aún no hay actividades cerradas. Secretaría debe cerrar una actividad antes de generar multas.'
              : 'Todavía no hay actividades. Secretaría puede registrarlas en Actividades.'
            : 'No hay actividades de este tipo. Selecciona otro tipo o solicita su creación en Actividades.'}
        </p>
      )}
    </div>
  );
}
