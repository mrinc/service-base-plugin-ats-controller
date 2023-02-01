import { Service } from "./plugin";
import { IPluginLogger } from "@bettercorp/service-base";
import { serialPort } from "@bettercorp/service-base-plugin-serial";
import { Tools } from "@bettercorp/tools";
import { clearInterval } from "timers";
import * as tx2 from "tx2";

export interface ParsedStateItem {
  input: number;
  connected: boolean;
  power: boolean;
}
export interface ParsedState {
  primary: ParsedStateItem;
  secondary: ParsedStateItem;
  db_in: ParsedStateItem;
  db_red: ParsedStateItem;
  ups_out: ParsedStateItem;
  blue_core: ParsedStateItem;
  red: ParsedStateItem;
  blue_house: ParsedStateItem;
}
export interface InputStates {
  initial_state_loaded: boolean;
  power_primary: boolean;
  power_secondary: boolean;
  power_DB: boolean;
  power_DB_red: boolean;
  power_UPS: boolean;
  power_blue_core: boolean;
  power_blue_house: boolean;
  power_red_house: boolean;

  last_db_power: number;
  lastPing: number;

  counter_last_db_power: number;
  counter_last_lastPing: number;
}

const MAX_PING_COUNT = 60;
export class Inputs {
  private log: IPluginLogger;
  private _serialPort: serialPort;
  private knownStates: InputStates = {
    initial_state_loaded: false,
    power_primary: false,
    power_secondary: false,
    power_DB: false,
    power_DB_red: false,
    power_UPS: false,
    power_blue_core: false,
    power_blue_house: false,
    power_red_house: false,

    last_db_power: 0,
    lastPing: 0,

    counter_last_db_power: Number.MIN_VALUE,
    counter_last_lastPing: MAX_PING_COUNT,
  };
  private metrics: any;
  private counterTimer!: NodeJS.Timer;
  constructor(self: Service) {
    this.log = self.log;
    this._serialPort = new serialPort(self);
    const aSelf = this;
    for (let key of Object.keys(this.knownStates)) {
      this.metrics[key] = tx2.metric({
        name: `inputs_${key}`,
        value: () => {
          if (Tools.isBoolean((aSelf.knownStates as any)[key])) {
            return (aSelf.knownStates as any)[key] == true ? 1 : 0;
          }
          return (aSelf.knownStates as any)[key];
        },
      });
    }
  }
  public get isReady(): boolean {
    return this.knownStates.initial_state_loaded;
  }
  public getState(): InputStates {
    return this.knownStates;
  }
  public async init() {
    const self = this;
    await this._serialPort.onMessage(
      async (line: string | Buffer): Promise<any> => {
        let asString =
          typeof line === "string" ? line : Buffer.from(line).toString("utf-8");
        await self.parseData(asString);
      }
    );
    this.counterTimer = setInterval(async () => {
      self.knownStates.counter_last_lastPing--;
      if (self.knownStates.counter_last_lastPing < 0) {
        await self.log.fatal("NO PING FROM MONITOR");
      }
    }, 1000);
  }
  public dispose() {
    clearInterval(this.counterTimer);
  }
  private async parseData(asString: string): Promise<any> {
    const self = this;
    if (asString.indexOf("[") < 0 || asString.indexOf("]") < 0)
      return undefined;

    let data = asString.split("[")[1].split("]")[0].split(":");
    await self.log.info("Known state: {state}", { state: asString });
    switch (data[0]) {
      case "STATE": {
        data.splice(0, 1);
        let rewritten = data
          .map((x) => Number.parseInt(x))
          .map((x, index) => {
            return {
              input: index + 1,
              connected: x > 0,
              power: x == 2,
            };
          });
        let output: ParsedState = {
          primary: rewritten[0],
          secondary: rewritten[1],
          db_in: rewritten[2],
          ups_out: rewritten[3],
          blue_core: rewritten[4],
          db_red: rewritten[4],
          red: rewritten[6],
          blue_house: rewritten[7],
        };
        await self.log.debug("{rewritten}", {
          rewritten: JSON.stringify(rewritten),
        });
        await self.log.debug("{output}", { output: JSON.stringify(output) });
        await self.handleParsedData(output);
      }
      case "PING":
        {
          self.knownStates.lastPing = new Date().getTime();
          self.knownStates.counter_last_lastPing = MAX_PING_COUNT;
          await self.log.info(" - PING Received: {lastPing}", {
            lastPing: self.knownStates.lastPing,
          });
        }
        break;
    }
  }
  private async handleParsedData(data: ParsedState) {
    this.knownStates.power_UPS = data.ups_out.power;
    this.knownStates.power_blue_house = data.blue_house.power;
    this.knownStates.power_blue_core = data.blue_core.power;
    this.knownStates.power_DB = data.db_in.power;
    this.knownStates.power_DB_red = data.db_red.power;
    this.knownStates.power_red_house = data.red.power;
    this.knownStates.power_primary = data.primary.power;
    this.knownStates.power_secondary = data.secondary.power;
    this.knownStates.initial_state_loaded = true;

    const now = new Date().getTime();

    if (this.knownStates.power_DB === true) {
      this.knownStates.last_db_power = now;
      this.knownStates.counter_last_db_power = 0;
    }

    await this.log.debug(JSON.stringify(this.knownStates));

    if (
      data.db_in.power !== data.db_red.power ||
      data.ups_out.power !== true ||
      data.ups_out.connected !== true ||
      data.blue_house.power !== true ||
      data.blue_house.connected !== true ||
      data.blue_core.power !== true ||
      data.blue_core.connected !== true ||
      data.primary.connected !== true ||
      data.secondary.connected !== true //||
      //now - this.knownStates.last_db_power > 5 * 60 * 1000
    ) {
      // log pager duty
      await this.log.error("NO POWER!!! ALERT");
    }
  }
}
