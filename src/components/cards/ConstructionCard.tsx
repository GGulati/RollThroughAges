type ConstructionCardProps = {
  title: string;
  details?: string[];
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  testId?: string;
};

export function ConstructionCard({
  title,
  details = [],
  actionLabel,
  actionDisabled = false,
  onAction,
  testId,
}: ConstructionCardProps) {
  return (
    <article className="development-card" data-testid={testId}>
      <p className="development-title">{title}</p>
      {details.map((detail) => (
        <p key={detail} className="development-effect">
          {detail}
        </p>
      ))}
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} disabled={actionDisabled}>
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}
