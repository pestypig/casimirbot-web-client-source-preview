export type SnapshotFileEntry = {
  path: string;
  sha256: string;
  bytes: number;
  lang: string;
};

export type RepoSnapshot = {
  root: string;
  commit: string;
  files: SnapshotFileEntry[];
  createdAt: number;
};

export type SymbolKind =
  | "function"
  | "class"
  | "const"
  | "let"
  | "var"
  | "enum"
  | "type"
  | "interface"
  | "param";

export type SymbolParam = {
  name: string;
  type?: string;
};

export type SymbolRec = {
  path: string;
  lang: "ts" | "tsx" | "js" | "jsx" | string;
  symbol: string;
  kind: SymbolKind;
  signature?: string;
  aliases: string[];
  params?: SymbolParam[];
  doc?: string;
  text: string;
  chunkId: string;
  byteStart: number;
  byteEnd: number;
  imports: string[];
  calls: string[];
  uses: string[];
  commit: string;
  createdAt: number;
};

export type EquationRec = {
  id: string;
  symbols: string[];
  sectionPath?: string;
  text: string;
  path: string;
  chunkId: string;
  commit: string;
  createdAt: number;
};

export type SymbolAliasMap = Record<string, string[]>;

export type AtlasExport = {
  snapshot: RepoSnapshot;
  symbols: SymbolRec[];
  equations: EquationRec[];
  aliases: SymbolAliasMap;
};
