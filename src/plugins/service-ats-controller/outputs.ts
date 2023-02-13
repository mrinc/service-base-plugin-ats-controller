import { raspPIGPIO } from "@bettercorp/service-base-plugin-raspverry-pi-gpio";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { Service } from "./plugin";
import { IPluginLogger } from "@bettercorp/service-base";
import * as tx2 from "tx2";
import { Tools } from "@bettercorp/tools";
import { smsPortalClient } from "@bettercorp/service-base-plugin-sms";

export const PinOutputs: IDictionary<number> = {
  contactor_primary: 4,
  contactor_secondary: 22,
  contactor_generator: 6,
};

export interface RelayState {
  contactor_primary: boolean;
  contactor_secondary: boolean;
  contactor_generator: boolean;
}

export class Outputs {
  private statesOfRelays: RelayState = {
    contactor_primary: false,
    contactor_secondary: false,
    contactor_generator: false,
  };
  private _gpio: raspPIGPIO;
  private log: IPluginLogger;
  private metrics: any = {};
  private smsportal: smsPortalClient;
  public sendSmsTo: string | null = null;
  constructor(self: Service) {
    this.smsportal = new smsPortalClient(self);
    this.log = self.log;
    this._gpio = new raspPIGPIO(self);
    const aSelf = this;
    for (let key of Object.keys(this.statesOfRelays)) {
      this.metrics[key] = tx2.metric({
        name: `outputs_${key}`,
        value: () => {
          if (Tools.isBoolean((aSelf.statesOfRelays as any)[key])) {
            return (aSelf.statesOfRelays as any)[key] == true ? 1 : 0;
          }
          return (aSelf.statesOfRelays as any)[key];
        },
      });
    }
  }
  public getState(): RelayState {
    return {
      contactor_generator: this.statesOfRelays.contactor_generator,
      contactor_primary: !this.statesOfRelays.contactor_primary,
      contactor_secondary: !this.statesOfRelays.contactor_secondary,
    };
  }
  public async setState(states: IDictionary<boolean | null>) {
    let hasChanges = false;
    for (let state of Object.keys(states)) {
      const thisState = states[state];
      if (!Tools.isBoolean(thisState)) continue;
      if (
        (this.statesOfRelays as unknown as IDictionary<boolean>)[state] !==
        thisState
      ) {
        hasChanges = true;
        (this.statesOfRelays as unknown as IDictionary<boolean>)[state] =
          thisState;
      }
    }
    if (!hasChanges) return;
    if (Tools.isString(this.sendSmsTo)) {
      if (
        this.statesOfRelays.contactor_generator !== states.contactor_generator
      ) {
        await this.smsportal.sendSMS({
          content: `Generator switched too ${
            states.contactor_generator ? "ON" : "OFF"
          }`,
          destination: this.sendSmsTo,
        });
      }
    }
    let pins: {
      pin: number;
      state: boolean;
    }[] = [];
    for (let state of Object.keys(this.statesOfRelays)) {
      pins.push({
        pin: PinOutputs[state],
        state: (this.statesOfRelays as unknown as IDictionary<boolean>)[state],
      });
    }
    await this.log.info(" - SET RELAYS");
    for (let key of Object.keys(this.statesOfRelays)) {
      await this.log.info(": RELAY {relay} ({pin}) SET TO {state}", {
        pin: PinOutputs[key],
        relay: key,
        state: (this.statesOfRelays as unknown as IDictionary<boolean>)[key],
      });
    }

    await this._gpio.setPinsState(pins);
  }
}
