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
};

export type JuntaPageId = keyof typeof pageLabels;

const pagesByRole: Record<RolLocal, JuntaPageId[]> = {
  ADMIN_JUNTA: ['junta', 'sectors', 'socios', 'tariffs'],
  SECRETARIA: [
    'membership',
    'sectors',
    'socios',
    'activities',
    'fines',
    'properties',
  ],
  TESORERIA: [
    'membership',
    'fines',
    'payments',
    'expenses',
    'inventory',
    'assets',
  ],
  SOCIO: ['membership'],
};

export function juntaNavigation(role: RolLocal | null) {
  const pages = role ? pagesByRole[role] : pagesByRole.SOCIO;
  return pages.map((id) => ({ id, label: pageLabels[id] }));
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
  }
}
