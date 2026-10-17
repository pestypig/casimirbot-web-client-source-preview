declare module "web-tree-sitter" {
  export default class Parser {
    static init(config?: { locateFile?: (scriptName: string, scriptDirectory?: string) => string }): Promise<void>;
    static Language: typeof Language;
    setLanguage(language: Language): void;
    parse(input: string): Tree;
  }

  export class Language {
    static load(source: ArrayBuffer | Uint8Array | string): Promise<Language>;
  }

  export interface Tree {
    delete(): void;
  }
}
