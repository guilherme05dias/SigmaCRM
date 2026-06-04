type DataTableProps<T> = {
  columns: Array<{ key: keyof T; label: string; render?: (row: T) => React.ReactNode }>;
  rows: T[];
};

export function DataTable<T extends { id?: unknown }>({ columns, rows }: DataTableProps<T>) {
  return (
    <div className="table-shell">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((column) => (
                <td key={String(column.key)}>
                  {column.render ? column.render(row) : String(row[column.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
