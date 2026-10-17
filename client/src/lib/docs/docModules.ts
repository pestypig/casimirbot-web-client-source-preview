type DocModuleLoader = () => Promise<string>;

export const DOC_MODULES = import.meta.glob("../../../../docs/**/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, DocModuleLoader>;
