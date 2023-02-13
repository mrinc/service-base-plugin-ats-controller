import { SecConfig } from "@bettercorp/service-base";
import { existsSync, writeFileSync } from "fs";

export interface MyPluginConfig {
  loadsheddingFile: string;
  startGeniMinutesBeforeLoadShedding: number;
  sendGeniSMS: {
    to: string;
    apiKey: string;
    secret: string;
  } | null;
}

export class Config extends SecConfig<MyPluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: MyPluginConfig
  ): MyPluginConfig {
    const config = {
      loadsheddingFile:
        existingConfig.loadsheddingFile !== undefined
          ? existingConfig.loadsheddingFile
          : "./loadshedding.json",
      sendGeniSMS:
        existingConfig.sendGeniSMS !== undefined
          ? existingConfig.sendGeniSMS
          : null,
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
