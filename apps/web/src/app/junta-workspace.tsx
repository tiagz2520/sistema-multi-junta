import type { RolLocal } from '@multi-junta/api-client';
import { ActivitiesPage } from '../features/administration/activities-page';
import {
  SectorsPage,
  SociosPage,
} from '../features/administration/registry-page';
import {
  ExpensesPage,
  FinesPage,
  PaymentsPage,
  TariffsPage,
} from '../features/finance/finance-page';
import {
  AssetsPage,
  InventoryPage,
  PropertiesPage,
} from '../features/resources/resources-page';
import { OwnMembershipPage, TenantPage } from '../features/tenant/tenant-view';
import {
  PortalAdminPage,
  PortalMemberPage,
} from '../features/portal/portal-page';
import {
  ConvocationsPage,
  DocumentsPage,
  MessagesPage,
} from '../features/communications/communications-page';
import { SchedulesPage } from '../features/schedules/schedules-page';
import { ReportsPage } from '../features/reports/reports-page';
import type { ModuleProps } from '../shared/ui/records';

const pageLabels = {
  junta: 'Mi junta',
  membership: 'Mi membresía',
  sectors: 'Sectores',
  socios: 'Socios',
  activities: 'Actividades',
  tariffs: 'Tarifas',
  fines: 'Multas',
  payments: 'Pagos',
  expenses: 'Gastos',
  inventory: 'Inventario',
  assets: 'Activos fijos',
  properties: 'Propiedades',
  vinculaciones: 'Vincular socios',
  portal: 'Mi portal',
  convocatorias: 'Convocatorias',
  documentos: 'Actas y oficios',
  mensajes: 'Mensajería',
  horarios: 'Horarios',
  reportes: 'Reportes',
};

export type JuntaPageId = keyof typeof pageLabels;

const navigationGroups: Record<JuntaPageId, string> = {
  junta: '01 / ORGANIZACIÓN',
  membership: '01 / ORGANIZACIÓN',
  sectors: '01 / ORGANIZACIÓN',
  socios: '01 / ORGANIZACIÓN',
  activities: '02 / OPERACIONES',
  tariffs: '02 / OPERACIONES',
  fines: '02 / OPERACIONES',
  payments: '02 / OPERACIONES',
  expenses: '02 / OPERACIONES',
  inventory: '03 / PATRIMONIO',
  assets: '03 / PATRIMONIO',
  properties: '03 / PATRIMONIO',
  vinculaciones: '04 / COMUNICACIÓN',
  portal: '04 / COMUNICACIÓN',
  convocatorias: '04 / COMUNICACIÓN',
  documentos: '04 / COMUNICACIÓN',
  mensajes: '04 / COMUNICACIÓN',
  horarios: '04 / COMUNICACIÓN',
  reportes: '05 / ANÁLISIS',
};

const pagesByRole: Record<RolLocal, JuntaPageId[]> = {
  ADMIN_JUNTA: [
    'junta',
    'sectors',
    'socios',
    'tariffs',
    'vinculaciones',
    'convocatorias',
    'documentos',
    'mensajes',
    'horarios',
    'reportes',
  ],
  SECRETARIA: [
    'membership',
    'sectors',
    'socios',
    'activities',
    'fines',
    'properties',
    'convocatorias',
    'documentos',
    'horarios',
    'reportes',
  ],
  TESORERIA: [
    'membership',
    'fines',
    'payments',
    'expenses',
    'inventory',
    'assets',
    'convocatorias',
    'documentos',
    'reportes',
  ],
  SOCIO: [
    'membership',
    'portal',
    'convocatorias',
    'documentos',
    'mensajes',
    'horarios',
  ],
};

export function juntaNavigation(role: RolLocal | null) {
  const pages = role ? pagesByRole[role] : pagesByRole.SOCIO;
  return pages.map((id) => ({
    id,
    label: pageLabels[id],
    group: navigationGroups[id],
  }));
}

export function JuntaWorkspace({
  page,
  role,
  ...props
}: ModuleProps & { page: JuntaPageId; role: RolLocal | null }) {
  switch (page) {
    case 'junta':
      return (
        <TenantPage
          id={props.juntaId}
          csrfToken={props.csrfToken}
          onExpired={props.onExpired}
        />
      );
    case 'membership':
      return (
        <OwnMembershipPage id={props.juntaId} onExpired={props.onExpired} />
      );
    case 'sectors':
      return <SectorsPage {...props} canWrite={role === 'ADMIN_JUNTA'} />;
    case 'socios':
      return <SociosPage {...props} canWrite={role === 'SECRETARIA'} />;
    case 'activities':
      return <ActivitiesPage {...props} />;
    case 'tariffs':
      return <TariffsPage {...props} canWrite={role === 'ADMIN_JUNTA'} />;
    case 'fines':
      return (
        <FinesPage
          {...props}
          canGenerate={role === 'SECRETARIA' || role === 'TESORERIA'}
          canVoid={role === 'TESORERIA'}
        />
      );
    case 'payments':
      return <PaymentsPage {...props} />;
    case 'expenses':
      return <ExpensesPage {...props} />;
    case 'inventory':
      return <InventoryPage {...props} />;
    case 'assets':
      return <AssetsPage {...props} />;
    case 'properties':
      return <PropertiesPage {...props} />;
    case 'vinculaciones':
      return <PortalAdminPage {...props} />;
    case 'portal':
      return <PortalMemberPage {...props} />;
    case 'convocatorias':
      return <ConvocationsPage {...props} canWrite={role === 'SECRETARIA'} />;
    case 'documentos':
      return <DocumentsPage {...props} canWrite={role === 'SECRETARIA'} />;
    case 'mensajes':
      return <MessagesPage {...props} />;
    case 'horarios':
      return (
        <SchedulesPage
          {...props}
          role={
            role === 'SECRETARIA' || role === 'ADMIN_JUNTA' ? role : 'SOCIO'
          }
        />
      );
    case 'reportes':
      return (
        <ReportsPage
          {...props}
          role={
            role === 'SECRETARIA' || role === 'TESORERIA' ? role : 'ADMIN_JUNTA'
          }
        />
      );
  }
}
