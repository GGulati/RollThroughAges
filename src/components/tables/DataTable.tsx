import { ReactNode } from 'react';

type DataTableProps = {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  caption?: string;
  className?: string;
};

export function DataTable({
  headers,
  rows,
  caption,
  className = 'scoreboard-table',
}: DataTableProps) {
  return (
    <table className={className}>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`table-row-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              <td key={`table-cell-${rowIndex}-${cellIndex}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
