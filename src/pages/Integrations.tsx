import { useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';
import type { IntegrationsClient } from '@/components/IntegrationsPanel';
import { api } from '@/lib/api';

/** Loan officer: connect GoHighLevel, choose activity emails, and make API keys. */
export default function Integrations() {
  const client = useMemo<IntegrationsClient>(
    () => ({
      get: api.integrations,
      saveGhl: api.saveGhl,
      disconnectGhl: api.disconnectGhl,
      testGhl: api.testGhl,
      setNotifyEmail: api.setNotifyEmail,
      createKey: api.createApiKey,
      deleteKey: api.deleteApiKey,
    }),
    [],
  );
  return (
    <div className="animate-lp-fade">
      <PageHeader title="Integrations" subtitle="Connect GoHighLevel, choose which emails you get, and let other tools talk to Basecamp." />
      <div className="max-w-[860px]">
        <IntegrationsPanel client={client} audience="lo" />
      </div>
    </div>
  );
}
