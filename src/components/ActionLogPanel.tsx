type ActionLogPanelProps = {
  title?: string;
  entries: string[];
  ariaLabel: string;
};

export function ActionLogPanel({
  title = 'Action Log',
  entries,
  ariaLabel,
}: ActionLogPanelProps) {
  return (
    <section className="app-panel">
      <h2>{title}</h2>
      <textarea className="log-textbox" readOnly value={entries.join('\n')} aria-label={ariaLabel} />
    </section>
  );
}
