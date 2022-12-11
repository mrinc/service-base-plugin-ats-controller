import { SecConfig } from "@bettercorp/service-base";

export interface MyPluginConfig {}

export class Config extends SecConfig<MyPluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: MyPluginConfig
  ): MyPluginConfig {
    return {};
  }
}
