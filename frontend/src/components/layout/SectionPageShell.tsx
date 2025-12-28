import type { ReactNode } from 'react';
import { PageShell } from './PageShell';
import { sectionCatalog, type SectionKey } from '../../app/sections';

type SectionPageShellProps = {
  section: SectionKey;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  maxWidth?: number | string;
};

export const SectionPageShell = ({
  section,
  title,
  description,
  actions,
  children,
  className,
  maxWidth,
}: SectionPageShellProps) => {
  const meta = sectionCatalog.find((item) => item.key === section);

  return (
    <PageShell
      title={title ?? meta?.label ?? 'ERIHUB'}
      description={description ?? meta?.description}
      actions={actions}
      className={className}
      maxWidth={maxWidth}
    >
      {children}
    </PageShell>
  );
};
