export function start(
  open: (path: string) => number,
  close: () => void,
  exec: (sql: string) => number,
  query: (sql: string) => number,
  queryResultLength: () => number,
  queryResultByte: (index: number) => number,
): Promise<void>;
