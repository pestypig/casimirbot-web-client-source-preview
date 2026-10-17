/// <reference lib="webworker" />

import * as WebTreeSitter from "web-tree-sitter";
import type { Language as ParserLanguage, Tree } from "web-tree-sitter";
import { buildChunkId, VocabularyNormalizer } from "./atlas";
import type { EquationRec, SymbolRec } from "./types";

type SupportedLanguage = "ts" | "tsx" | "js" | "jsx";

type InitMessage = {
  t: "init";
  commit?: string;
  createdAt?: number;
  vocabulary?: { canonical: string; aliases?: string[] }[];
  languageUrls?: Partial<Record<SupportedLanguage, string>>;
};

type IndexMessage = {
  t: "index";
  id: string;
  path: string;
  content: string;
  lang?: SupportedLanguage;
  commit?: string;
  createdAt?: number;
};

type ResetMessage = { t: "reset" };
type IncomingMessage = InitMessage | IndexMessage | ResetMessage;

type ReadyEvent = { t: "ready"; languages: SupportedLanguage[] };
type IndexedEvent = {
  t: "indexed";
  id: string;
  path: string;
  symbols: SymbolRec[];
  equations: EquationRec[];
  diagnostics: string[];
};
type ErrorEvent = { t: "error"; id?: string; error: string };
type OutgoingMessage = ReadyEvent | IndexedEvent | ErrorEvent;

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const defaultLanguageUrls: Record<SupportedLanguage, string> = {
  ts: "/treesitter/tree-sitter-typescript.wasm",
  tsx: "/treesitter/tree-sitter-tsx.wasm",
  js: "/treesitter/tree-sitter-javascript.wasm",
  jsx: "/treesitter/tree-sitter-javascript.wasm",
};

const languageCache = new Map<SupportedLanguage, ParserLanguage>();
let normalizer = new VocabularyNormalizer();
let languageUrls: Record<SupportedLanguage, string> = { ...defaultLanguageUrls };

let defaultCommit = "workspace";
let defaultCreatedAt = Date.now();
let runtimeReady: Promise<void> | null = null;
type SyntaxNode = any;

function parserCtor() {
  const ParserClass = WebTreeSitter.Parser;
  if (!ParserClass) {
    throw new Error("web-tree-sitter Parser is unavailable in this environment");
  }
  return ParserClass;
}

function post(message: OutgoingMessage) {
  ctx.postMessage(message);
}

async function ensureRuntime() {
  if (runtimeReady) return runtimeReady;
  const ParserClass = parserCtor();
  runtimeReady = ParserClass.init({
    locateFile: () => "/treesitter/tree-sitter.wasm",
  });
  return runtimeReady;
}

async function loadLanguage(lang: SupportedLanguage) {
  await ensureRuntime();
  const cached = languageCache.get(lang);
  if (cached) return cached;

  const url = languageUrls[lang];
  if (!url) throw new Error(`No Tree-sitter grammar URL provided for "${lang}"`);
  const language = await WebTreeSitter.Language.load(url);
  languageCache.set(lang, language);
  return language;
}

async function parseWithLanguage(lang: SupportedLanguage, source: string) {
  const ParserClass = parserCtor();
  const language = await loadLanguage(lang);
  const parser = new ParserClass();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  parser.delete();
  if (!tree) {
    throw new Error(`Tree-sitter returned no parse tree for ${lang} input.`);
  }
  return tree;
}

const encoder = new TextEncoder();

function detectLanguageFromPath(path: string): SupportedLanguage {
  const lower = path.toLowerCase();
  if (/\.(tsx)$/.test(lower)) return "tsx";
  if (/\.(cts|mts|d\.ts|ts)$/.test(lower)) return "ts";
  if (/\.(jsx)$/.test(lower)) return "jsx";
  return "js";
}

function captureLeadingComment(source: string, startIndex: number) {
  const upToStart = source.slice(0, startIndex);
  const blockMatch = /\/\*\*[\s\S]*?\*\/\s*$/.exec(upToStart);
  if (blockMatch) {
    return blockMatch[0];
  }
  const lines = upToStart.split(/\r?\n/);
  const commentLines: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/^\s*\/\//.test(line)) {
      commentLines.push(line.replace(/^\s*\/\//, "").trimEnd());
    } else if (line.trim() === "") {
      continue;
    } else {
      break;
    }
  }
  if (!commentLines.length) return undefined;
  return commentLines.reverse().join("\n");
}

function computeByteOffsets(source: string, start: number, end: number) {
  const prefix = source.slice(0, start);
  const segment = source.slice(start, end);
  const byteStart = encoder.encode(prefix).byteLength;
  const byteEnd = byteStart + encoder.encode(segment).byteLength;
  return { byteStart, byteEnd };
}

function extractEquations(doc?: string) {
  if (!doc) return [];
  const equations: string[] = [];
  const tagRegex = /@equation\s+([^\s*]+)/g;
  const inline = doc.matchAll(tagRegex);
  for (const match of inline) {
    equations.push(match[1]);
  }
  const dollarRegex = /\$(.+?)\$/g;
  for (const match of doc.matchAll(dollarRegex)) {
    const expr = match[1].trim();
    if (expr) equations.push(expr);
  }
  return Array.from(new Set(equations));
}

function extractAliases(doc?: string) {
  if (!doc) return [];
  const aliases = new Set<string>();
  const aliasRegex = /@(alias|symbol)\s+([^\s*]+)/g;
  for (const match of doc.matchAll(aliasRegex)) {
    aliases.add(match[2]);
  }
  return Array.from(aliases);
}

function parseParams(signature?: string) {
  if (!signature) return undefined;
  const paren = signature.indexOf("(");
  const close = signature.lastIndexOf(")");
  if (paren === -1 || close === -1 || close <= paren) return undefined;

  const raw = signature.slice(paren + 1, close).trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((param) => param.trim())
    .filter(Boolean)
    .map((param) => {
      const [name, type] = param.split(":").map((part) => part.trim());
      return { name, type };
    });
}

function buildSymbolRecord(
  path: string,
  lang: SupportedLanguage,
  symbol: string,
  kind: SymbolRec["kind"],
  signature: string | undefined,
  doc: string | undefined,
  body: string,
  start: number,
  end: number,
  imports: string[],
  commit: string,
  createdAt: number,
): SymbolRec {
  const { byteStart, byteEnd } = computeByteOffsets(body, start, end);
  const chunkId = buildChunkId(path, symbol, byteStart, byteEnd);
  const aliasSet = new Set(extractAliases(doc));
  const canonical = normalizer.canonicalize(symbol);
  if (canonical && canonical !== symbol) {
    aliasSet.add(canonical);
  }
  const aliases = Array.from(aliasSet);
  normalizer.register(canonical || symbol, [symbol, ...aliases]);
  const params = parseParams(signature);
  const snippetEnd = Math.min(body.length, start + 800);
  return {
    path,
    lang,
    symbol,
    kind,
    signature,
    aliases,
    params,
    doc,
    text: body.slice(start, snippetEnd),
    chunkId,
    byteStart,
    byteEnd,
    imports,
    calls: [],
    uses: [],
    commit,
    createdAt,
  };
}

function normalizeWhitespace(snippet: string, limit = 220) {
  const compact = snippet.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit)}…`;
}

function firstLine(source: string, start: number, end: number) {
  const raw = source.slice(start, end);
  const [line] = raw.split(/\r?\n/, 1);
  return normalizeWhitespace(line ?? raw);
}

function signatureBeforeBody(source: string, node: SyntaxNode) {
  const body = node.childForFieldName("body");
  const end = body ? body.startIndex : node.endIndex;
  return firstLine(source, node.startIndex, end);
}

function signatureForRange(source: string, node: SyntaxNode) {
  return firstLine(source, node.startIndex, node.endIndex);
}

function extractSymbolsFromTree(
  tree: Tree,
  request: IndexMessage,
  imports: string[],
  commit: string,
  createdAt: number,
): SymbolRec[] {
  const { content, path } = request;
  const lang = request.lang ?? detectLanguageFromPath(path);
  const symbols: SymbolRec[] = [];
  const docCache = new Map<number, string | undefined>();

  const docFor = (startIndex: number) => {
    if (!docCache.has(startIndex)) {
      docCache.set(startIndex, captureLeadingComment(content, startIndex));
    }
    return docCache.get(startIndex);
  };

  const addSymbol = (
    node: SyntaxNode,
    symbolName: string | undefined,
    kind: SymbolRec["kind"],
    signature: string | undefined,
    docAnchor?: SyntaxNode,
  ) => {
    const symbol = symbolName?.trim();
    if (!symbol) return;
    const doc = docFor(docAnchor ? docAnchor.startIndex : node.startIndex);
    const record = buildSymbolRecord(
      path,
      lang,
      symbol,
      kind,
      signature,
      doc,
      content,
      node.startIndex,
      node.endIndex,
      imports,
      commit,
      createdAt,
    );
    symbols.push(record);
  };

  for (const child of tree.rootNode.namedChildren) {
    visitTopLevel(child, child);
  }

  return symbols;

  function visitTopLevel(node: SyntaxNode, docAnchor: SyntaxNode) {
    switch (node.type) {
      case "export_statement":
      case "export_declaration":
      case "export_default_declaration":
      case "export_clause":
        for (const exported of node.namedChildren) {
          visitTopLevel(exported, node);
        }
        break;
      case "function_declaration": {
        const nameNode = node.childForFieldName("name");
        const signature = signatureBeforeBody(content, node);
        addSymbol(node, nameNode?.text, "function", signature, docAnchor);
        break;
      }
      case "class_declaration": {
        const nameNode = node.childForFieldName("name");
        const signature = signatureBeforeBody(content, node);
        addSymbol(node, nameNode?.text, "class", signature, docAnchor);
        break;
      }
      case "interface_declaration": {
        const nameNode = node.childForFieldName("name");
        const signature = signatureBeforeBody(content, node);
        addSymbol(node, nameNode?.text, "interface", signature, docAnchor);
        break;
      }
      case "type_alias_declaration": {
        const nameNode = node.childForFieldName("name");
        const signature = signatureForRange(content, node);
        addSymbol(node, nameNode?.text, "type", signature, docAnchor);
        break;
      }
      case "enum_declaration": {
        const nameNode = node.childForFieldName("name");
        const signature = signatureBeforeBody(content, node);
        addSymbol(node, nameNode?.text, "enum", signature, docAnchor);
        break;
      }
      case "lexical_declaration":
      case "variable_declaration": {
        handleVariableLike(node, docAnchor);
        break;
      }
      default:
        break;
    }
  }

  function handleVariableLike(node: SyntaxNode, docAnchor: SyntaxNode) {
    const keyword = node.child(0)?.text ?? "";
    const kind: SymbolRec["kind"] =
      keyword === "let" ? "let" : keyword === "var" ? "var" : "const";
    for (const declarator of node.namedChildren) {
      if (declarator.type !== "variable_declarator") continue;
      const nameNode = declarator.childForFieldName("name");
      const signature = signatureForRange(content, declarator);
      addSymbol(declarator, nameNode?.text, kind, signature, docAnchor);
    }
  }
}

function heuristicSymbolScan(
  request: IndexMessage,
  imports: string[],
  commit: string,
  createdAt: number,
): SymbolRec[] {
  const { content, path } = request;
  const lang = request.lang ?? detectLanguageFromPath(path);
  const symbols: SymbolRec[] = [];

  const patterns: Array<{
    kind: SymbolRec["kind"];
    regex: RegExp;
    signature: (match: RegExpExecArray) => string | undefined;
  }> = [
    {
      kind: "function",
      regex:
        /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(\([^)]*\))?/g,
      signature: (match) => `function ${match[1]}${match[2] ?? "()"}`,
    },
    {
      kind: "const",
      regex: /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*(?::\s*[^=]+)?=/g,
      signature: (match) => `const ${match[1]}`,
    },
    {
      kind: "class",
      regex: /(?:export\s+)?class\s+([A-Za-z0-9_]+)/g,
      signature: (match) => `class ${match[1]}`,
    },
    {
      kind: "type",
      regex: /(?:export\s+)?type\s+([A-Za-z0-9_]+)/g,
      signature: (match) => `type ${match[1]}`,
    },
    {
      kind: "interface",
      regex: /(?:export\s+)?interface\s+([A-Za-z0-9_]+)/g,
      signature: (match) => `interface ${match[1]}`,
    },
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(content))) {
      const symbolName = match[1];
      const start = match.index;
      const end = start + match[0].length;
      const doc = captureLeadingComment(content, start);
      const signature = pattern.signature(match);
      symbols.push(
        buildSymbolRecord(
          path,
          lang,
          symbolName,
          pattern.kind,
          signature,
          doc,
          content,
          start,
          end,
          imports,
          commit,
          createdAt,
        ),
      );
    }
  }

  return symbols;
}

function extractEquationRecords(
  symbol: SymbolRec,
  commit: string,
  createdAt: number,
): EquationRec[] {
  const equations = extractEquations(symbol.doc);
  return equations.map((equation, index) => {
    const id = `${symbol.path}#${symbol.symbol}-${index}`;
    return {
      id,
      symbols: [equation, symbol.symbol, ...symbol.aliases],
      sectionPath: undefined,
      text: symbol.doc ?? "",
      path: symbol.path,
      chunkId: symbol.chunkId,
      commit,
      createdAt,
    };
  });
}

async function handleInit(message: InitMessage) {
  if (message.commit) defaultCommit = message.commit;
  if (message.createdAt) defaultCreatedAt = message.createdAt;
  if (message.vocabulary) {
    normalizer = new VocabularyNormalizer(message.vocabulary);
  }
  if (message.languageUrls) {
    languageUrls = { ...defaultLanguageUrls, ...message.languageUrls };
  }

  const langs: SupportedLanguage[] = [];
  for (const lang of Object.keys(languageUrls) as SupportedLanguage[]) {
    try {
      await loadLanguage(lang);
      langs.push(lang);
    } catch (error) {
      console.warn(`[code-index] Skipping grammar "${lang}":`, error);
    }
  }

  post({ t: "ready", languages: langs });
}

async function handleIndex(message: IndexMessage) {
  const lang = message.lang ?? detectLanguageFromPath(message.path);
  const commit = message.commit ?? defaultCommit;
  const createdAt = message.createdAt ?? defaultCreatedAt;
  const imports = Array.from(
    new Set(
      Array.from(message.content.matchAll(/import\s+[^'"]*["']([^"']+)["']/g)).map(
        (match) => match[1],
      ),
    ),
  );

  try {
    const tree = await parseWithLanguage(lang, message.content);
    const symbols = extractSymbolsFromTree(tree, message, imports, commit, createdAt);
    const equations = symbols.flatMap((symbol) =>
      extractEquationRecords(symbol, commit, createdAt),
    );
    tree.delete();
    post({
      t: "indexed",
      id: message.id,
      path: message.path,
      symbols,
      equations,
      diagnostics: [],
    });
  } catch (error) {
    console.warn(`[code-index] Falling back to heuristic scan for ${message.path}:`, error);
    const symbols = heuristicSymbolScan(message, imports, commit, createdAt);
    const equations = symbols.flatMap((symbol) =>
      extractEquationRecords(symbol, commit, createdAt),
    );
    post({
      t: "indexed",
      id: message.id,
      path: message.path,
      symbols,
      equations,
      diagnostics: [
        error instanceof Error ? error.message : "Failed to parse file with Tree-sitter",
      ],
    });
  }
}

ctx.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  switch (message.t) {
    case "init":
      void handleInit(message).catch((error) => {
        post({
          t: "error",
          error: error instanceof Error ? error.message : "Failed to initialize worker",
        });
      });
      break;
    case "index":
      void handleIndex(message).catch((error) => {
        post({
          t: "error",
          id: message.id,
          error: error instanceof Error ? error.message : "Failed to index file",
        });
      });
      break;
    case "reset":
      normalizer = new VocabularyNormalizer();
      languageCache.clear();
      runtimeReady = null;
      languageUrls = { ...defaultLanguageUrls };
      defaultCommit = "workspace";
      defaultCreatedAt = Date.now();
      break;
    default:
      break;
  }
};
