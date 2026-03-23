import { LiteParse, type LiteParseConfig } from "@llamaindex/liteparse";
import fs from "fs/promises";

async function loadConfig(
  configFile: string,
): Promise<Partial<LiteParseConfig>> {
  const content = await fs.readFile(configFile, { encoding: "utf-8" });
  return JSON.parse(content);
}

export async function parse({
  filePath,
  configFile = undefined,
}: {
  filePath: string;
  configFile?: string | undefined;
}): Promise<string> {
  let config: Partial<LiteParseConfig> = { outputFormat: "text" };
  if (configFile) {
    config = await loadConfig(configFile);
    if (config.outputFormat != "text") {
      console.warn("You cannot use an output format different from 'text'");
      config.outputFormat = "text";
    }
  }
  const parser = new LiteParse(config);
  const result = await parser.parse(filePath);
  return result.text;
}
