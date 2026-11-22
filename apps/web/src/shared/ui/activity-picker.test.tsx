import type { Actividad } from '@multi-junta/api-client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActivityPicker } from './activity-picker';

type Item = Pick<Actividad, 'id' | 'tipo' | 'titulo' | 'inicio' | 'estado'>;

const examples: Item[] = [
  {
    id: 'a',
    tipo: 'ASAMBLEA',
    titulo: 'Asamblea ordinaria',
    inicio: '2026-11-23T15:00:00.000Z',
    estado: 'CERRADA',
  },
  {
    id: 'm',
    tipo: 'MINGA',
    titulo: 'Minga de canales',
    inicio: '2026-11-24T15:00:00.000Z',
    estado: 'ABIERTA',
  },
];

describe('Selector editorial de actividades', () => {
  it('separa el tipo de la actividad existente en convocatorias', () => {
    const html = renderToStaticMarkup(
      <ActivityPicker activities={examples} name="actividadId" />,
    );
    expect(html).toContain('Asambleas y mingas');
    expect(html).toContain('Asamblea');
    expect(html).toContain('Minga');
    expect(html).toContain('Asamblea ordinaria');
    expect(html).toContain('Minga de canales');
    expect(html).toContain('name="actividadId"');
  });

  it('solo presenta actividades cerradas para generar multas', () => {
    const html = renderToStaticMarkup(
      <ActivityPicker activities={examples} closedOnly />,
    );
    expect(html).toContain('Asamblea ordinaria');
    expect(html).not.toContain('Minga de canales');
  });

  it('explica cuando todavía no hay actividades', () => {
    const html = renderToStaticMarkup(
      <ActivityPicker activities={[]} name="actividadId" />,
    );
    expect(html).toContain('Todavía no hay actividades');
  });
});
