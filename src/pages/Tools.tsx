import { PageHeader } from '@/components/PageHeader';
import { ToolsWorkspace } from '@/components/ToolsWorkspace';
import { useSettings } from '@/context/SettingsContext';
import { api } from '@/lib/api';

export default function Tools() {
  const { settings } = useSettings();

  return (
    <div className="animate-lp-fade">
      <PageHeader title="Tools" subtitle="Quick calculators to round out your borrower conversation." />
      <ToolsWorkspace
        downloadReport={({ preparedFor, sections }) =>
          api.reportPdf({
            preparedFor,
            sections,
            officer: { name: settings.name, title: settings.officerTitle },
            lender: {
              name: settings.lenderName || settings.company,
              phone: settings.phone,
              email: settings.email,
              nmls: settings.lenderNmls || settings.nmls,
              website: settings.website,
              address: settings.lenderAddress,
            },
            logo: settings.logoDataUrl || undefined,
          })
        }
      />
    </div>
  );
}
