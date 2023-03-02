import { SecConfig } from "@bettercorp/service-base";
import { existsSync, writeFileSync } from "fs";

export interface MyPluginConfig {
  loadsheddingFile: string;
  startGeniMinutesBeforeLoadShedding: number;
  /*sendGeniSMS: {
    to: string;
    apiKey: string;
    secret: string;
  } | null;*/
  logApiEndpoint?: string;
}

export class Config extends SecConfig<MyPluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: MyPluginConfig
  ): MyPluginConfig {
    const config = {
      logApiEndpoint:
        existingConfig.logApiEndpoint !== undefined
          ? existingConfig.logApiEndpoint
          : undefined,
      loadsheddingFile:
        existingConfig.loadsheddingFile !== undefined
          ? existingConfig.loadsheddingFile
          : "./loadshedding.json",
      /*sendGeniSMS:
        existingConfig.sendGeniSMS !== undefined
          ? existingConfig.sendGeniSMS
          : null,*/
      startGeniMinutesBeforeLoadShedding:
        existingConfig.startGeniMinutesBeforeLoadShedding !== undefined
          ? existingConfig.startGeniMinutesBeforeLoadShedding
          : 5,
    };
    if (!existsSync(config.loadsheddingFile))
      writeFileSync(
        config.loadsheddingFile,
        '{ "schedule": [], "currentStage": 0 }'
      );
    return config;
  }
}
