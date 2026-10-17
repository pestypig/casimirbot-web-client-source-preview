export type WeightManifestShard = {
  url: string;
  size: number;
  sha256: string;
};

export type WeightManifest = {
  modelName: string;
  dtype: "q4" | "q8" | "fp16";
  vocabUrl: string;
  shards: WeightManifestShard[];
  layers: number;
  hiddenSize: number;
  ctxLen: number;
  eosToken: string;
  version: number;
};
