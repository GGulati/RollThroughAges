import { ReactNode } from 'react';

type ConstructionGroupProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  expandedContent: ReactNode;
  collapsedContent: ReactNode;
};

export function ConstructionGroup({
  title,
  expanded,
  onToggle,
  expandedContent,
  collapsedContent,
}: ConstructionGroupProps) {
  return (
    <>
      <div className="collapsible-header">
        <p className="choice-label">{title}</p>
        <button type="button" className="section-toggle" onClick={onToggle}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {expanded ? expandedContent : collapsedContent}
    </>
  );
}
