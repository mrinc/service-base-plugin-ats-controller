import { IPluginConfig, SecConfig } from "@bettercorp/service-base";
import { Tools } from "@bettercorp/tools";

export interface PluginLogFiles {
  error: string;
  info: string;
  debug: string;
  warn: string;
  stat: string;
}

export interface PluginConfig extends IPluginConfig {
  logFiles?: PluginLogFiles;
  logFile?: string;
}

export class Config extends SecConfig<PluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: PluginConfig
  ): PluginConfig {
    if (Tools.isNullOrUndefined(existingConfig))
      return {
        logFiles: undefined,
        logFile: "./log.log",
      };
    existingConfig.logFiles = undefined; // just forcing because not supporting yet
    return {
      logFiles: !Tools.isNullOrUndefined(existingConfig.logFiles)
        ? existingConfig.logFiles
        : undefined,
      logFile: Tools.isNullOrUndefined(existingConfig.logFiles)
        ? !Tools.isNullOrUndefined(existingConfig.logFile)
          ? existingConfig.logFile
          : "./log.log"
        : undefined,
    };
  }
}
