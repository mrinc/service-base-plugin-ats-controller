import {
  IPluginLogger,
  ServiceCallable,
  ServicesBase,
} from "@bettercorp/service-base";
import { MyPluginConfig } from "./sec.config";
import { Tools } from "@bettercorp/tools";
import * as tx2 from "tx2";
import { loadshedding } from "./loadshedding";
import { Outputs } from "./outputs";
import { Inputs } from "./inputs";
import { Web } from "./web";

export enum SysState {
  Unknown = -1,
  Primary = 0,
  Secondary = 1,
}

export class Service extends ServicesBase<
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  MyPluginConfig
> {
  //private knownStates_old: any = null;
  private metrics: any = {};
  public loadSheddingState = {
    currentStage: 0,
    inLoadShedding: false,
    timeHUntilNextLS: 0,
    timeMUntilNextLS: 0,
    startGeniMinutesBeforeLoadShedding: 0,
    startGeniMinutesBeforeLoadSheddingCounter: 0,
  };
  public knownStates = {
    systemBusy: false,
    systemError: false,
    systemPreppedForLoadShedding: false,
    systemState: SysState.Unknown,
    contactor_generator_time: 0,
    //contactor_generator_last_warmupTime: 0,
    //contactor_generator_startup_count: 0,
  };
  private loadSheddingTimer: NodeJS.Timer | null = null;
  private counterTimer: NodeJS.Timer | null = null;
  public loadShedding!: loadshedding;
  public outputs: Outputs;
  public inputs: Inputs;
  private web: Web;
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);
    this.outputs = new Outputs(this);
    this.inputs = new Inputs(this);
    this.web = new Web(this);

    const self = this;
    for (let key of Object.keys(this.knownStates)) {
      this.metrics[key] = tx2.metric({
        name: key,
        value: () => {
          if (Tools.isBoolean((self.knownStates as any)[key])) {
            return (self.knownStates as any)[key] == true ? 1 : 0;
          }
          return (self.knownStates as any)[key];
        },
      });
    }
    for (let key of Object.keys(this.loadSheddingState)) {
      this.metrics[key] = tx2.metric({
        name: key,
        value: () => {
          if (Tools.isBoolean((self.loadSheddingState as any)[key])) {
            return (self.loadSheddingState as any)[key] == true ? 1 : 0;
          }
          return (self.loadSheddingState as any)[key];
        },
      });
    }
  }

  private _geniContactorTimer: NodeJS.Timer | null = null;
  public override dispose(): void {
    this.inputs.dispose();
    if (this._geniContactorTimer !== null)
      clearInterval(this._geniContactorTimer);
    //if (this.pingTimer !== null) clearInterval(this.pingTimer);
    if (this.counterTimer !== null) clearInterval(this.counterTimer);
    if (this.loadSheddingTimer !== null) clearInterval(this.loadSheddingTimer);
  }

  // private async setState(systemState: SysState) {
  //   if (this.knownStates.systemBusy)
  //     return await this.log.warn("Cannot change state, busy");
  //   this.knownStates.systemState = systemState;

  //   await this.log.warn("set system state: {state}", { state: systemState });
  //   switch (systemState) {
  //     case SysState.Primary:
  //       {
  //         const requiresDelay =
  //           this.knownStates.contactor_secondary === true &&
  //           this.knownStates.power_secondary === true &&
  //           this.knownStates.power_DB === true;
  //         if (requiresDelay) {
  //           await Tools.delay(120000);
  //           if (!this.knownStates.power_primary) {
  //             this.knownStates.systemBusy = false;
  //             this.setState(SysState.Secondary);
  //             return;
  //           }
  //         }
  //         /*if (!this.knownStates.contactor_primary) {
  //           this.knownStates.contactor_primary = false;
  //         }*/
  //         this.knownStates.contactor_secondary = false;
  //         await this.sendContactorUpdate("setState-1");
  //         if (requiresDelay) {
  //           await Tools.delay(5000);
  //         }
  //         this.knownStates.contactor_primary = true;
  //         await this.sendContactorUpdate("setState-2");
  //         if (this.knownStates.contactor_generator === true) {
  //           await Tools.delay(60000);
  //           this.knownStates.contactor_generator = false;
  //           await this.sendContactorUpdate("setState-3");
  //           await Tools.delay(5000);
  //         }
  //         await Tools.delay(5000);
  //         this.knownStates.contactor_secondary = true;
  //         await this.sendContactorUpdate("setState-4");
  //         this.knownStates.systemBusy = false;
  //       }
  //       return;
  //     case SysState.Secondary:
  //       {
  //         this.knownStates.contactor_primary = false;
  //         //this.knownStates.contactor_secondary = false;
  //         const geniState =
  //           this.knownStates.power_secondary === true ? true : false;
  //         this.knownStates.contactor_generator = true;
  //         if (!geniState) this.knownStates.contactor_secondary = false;
  //         await this.sendContactorUpdate("setState-5");

  //         let maxWarmupTime = 60; //s
  //         await Tools.delay(10000);

  //         maxWarmupTime = maxWarmupTime - 10;
  //         if (this.knownStates.power_secondary !== true) {
  //           this.knownStates.contactor_generator = false;
  //           await this.sendContactorUpdate("setState-6");
  //           await Tools.delay(5000);
  //           maxWarmupTime = maxWarmupTime - 5;
  //           this.knownStates.contactor_generator = true;
  //           await this.sendContactorUpdate("setState-7");
  //           await Tools.delay(10000);
  //           maxWarmupTime = maxWarmupTime - 10;
  //         }
  //         if (this.knownStates.power_secondary !== true) {
  //           this.knownStates.contactor_generator = false;
  //           await this.sendContactorUpdate("setState-8");
  //           await Tools.delay(5000);
  //           maxWarmupTime = maxWarmupTime - 5;
  //           this.knownStates.contactor_generator = true;
  //           await this.sendContactorUpdate("setState-9");
  //           await Tools.delay(10000);
  //           maxWarmupTime = maxWarmupTime - 10;
  //         }

  //         if (this.knownStates.power_secondary !== true) {
  //           await this.log.error("FAILED TO START GENERATOR");
  //           this.knownStates.contactor_generator = false;
  //           this.knownStates.contactor_primary = true;
  //           this.knownStates.contactor_secondary = true;
  //           await this.log.error(
  //             "FAILED TO ANY STATE, WAITING ON KNOWLEDGEMENT"
  //           );
  //           await this.sendContactorUpdate("setState-10");
  //           this.knownStates.systemBusy = false;
  //           return;
  //         }

  //         if (geniState) {
  //           await this.log.warn("Geni was already running, we`ll skip to on");
  //           await Tools.delay(10000);
  //         } else {
  //           await this.log.warn("GENERATOR WARMUP");
  //           await Tools.delay((maxWarmupTime > 10 ? maxWarmupTime : 10) * 1000);
  //         }
  //         this.knownStates.contactor_secondary = true;
  //         await this.sendContactorUpdate("setState-11");
  //         this.knownStates.systemBusy = false;
  //       }
  //       return;
  //   }

  //   this.knownStates.systemBusy = false;
  // }
  async sendContactorUpdate(
    contactor_primary: boolean | null,
    contactor_secondary: boolean | null,
    contactor_generator: boolean | null,
    note?: string
  ) {
    if (Tools.isString(note))
      await this.log.info("Sending contactor update: {note}", { note });
    await this.outputs.setState({
      contactor_primary: !contactor_primary,
      contactor_secondary: !contactor_secondary,
      contactor_generator: contactor_generator,
    });
  }

  public override async init(): Promise<void> {
    //const self = this;
    this.loadShedding = new loadshedding(
      (await this.getPluginConfig()).loadsheddingFile
    );
    this.loadSheddingState.startGeniMinutesBeforeLoadShedding = (
      await this.getPluginConfig()
    ).startGeniMinutesBeforeLoadShedding;
    await this.inputs.init();
    await this.web.init();
  }
  public async runLoadSheddingUpdater() {
    const self = this;
    if (this.knownStates.systemBusy) return;
    await self.log.info("Check Load Shedding");
    self.loadSheddingState.currentStage = self.loadShedding.getStage();
    let timeBeforeLS = self.loadShedding.getTimeUntilNextLoadShedding();
    await self.log.info("Time before LS: {LST}", { LST: timeBeforeLS });
    if (timeBeforeLS <= -1) {
      self.loadSheddingState.inLoadShedding = false;
      self.loadSheddingState.timeHUntilNextLS = 0;
      self.loadSheddingState.timeMUntilNextLS = 0;
      self.loadSheddingState.startGeniMinutesBeforeLoadSheddingCounter = -3;
    } else if (timeBeforeLS === 0) {
      self.loadSheddingState.inLoadShedding = true;
      self.loadSheddingState.timeHUntilNextLS = 0;
      self.loadSheddingState.timeMUntilNextLS = 0;
      self.loadSheddingState.startGeniMinutesBeforeLoadSheddingCounter = -1;
    } else {
      self.loadSheddingState.inLoadShedding = false;

      timeBeforeLS = timeBeforeLS / 1000; // s
      timeBeforeLS = timeBeforeLS / 60; // m
      let timeBeforeLSH = Math.floor(timeBeforeLS / 60); // h

      self.loadSheddingState.startGeniMinutesBeforeLoadSheddingCounter =
        timeBeforeLS -
        self.loadSheddingState.startGeniMinutesBeforeLoadShedding;
      if (self.loadSheddingState.startGeniMinutesBeforeLoadSheddingCounter < 0)
        self.loadSheddingState.startGeniMinutesBeforeLoadSheddingCounter = -2;

      let relayStates = self.outputs.getState();
      let powerStates = self.inputs.getState();

      if (
        timeBeforeLS <=
          self.loadSheddingState.startGeniMinutesBeforeLoadShedding &&
        relayStates.contactor_generator === false &&
        powerStates.power_secondary === false
      ) {
        self.knownStates.systemBusy = true;
        await self.log.warn("starting geni in prep for load shedding");
        await self.sendContactorUpdate(null, false, true);
        await Tools.delay(15000);
        powerStates = self.inputs.getState();
        if (!powerStates.power_secondary) {
          await self.sendContactorUpdate(null, true, false);
          await self.log.error("FAILED TO PREP GENI FOR LOAD SHEDDING!");
        } else {
          self.knownStates.systemPreppedForLoadShedding = true;
        }
        await Tools.delay(5000);
        self.knownStates.systemBusy = false;
      }

      self.loadSheddingState.timeHUntilNextLS = timeBeforeLSH;
      self.loadSheddingState.timeMUntilNextLS =
        timeBeforeLS - timeBeforeLSH * 60;
    }

    // if (
    //   !self.knownStates.systemBusy &&
    //   self.knownStates.power_primary === true &&
    //   self.knownStates.systemState === SysState.Primary &&
    //   self.knownStates.contactor_generator === true &&
    //   new Date().getTime() - self.knownStates.contactor_generator_time >
    //     (self.loadSheddingState.startGeniMinutesBeforeLoadShedding + 10) *
    //       60 *
    //       1000
    // ) {
    //   // 10+ min
    //   self.knownStates.systemState = SysState.Primary;
    //   self.checkState();
    // }
  }
  public override async run(): Promise<void> {
    //await this.sendContactorUpdate(true);
    const self = this;
    this.knownStates.systemBusy = true;
    setTimeout(async () => {
      await this.log.warn("checking sys state [{state}]", {
        state: this.knownStates.systemState,
      });
      while (!self.inputs.isReady) await Tools.delay(1000);
      let currentState = self.inputs.getState();

      if (currentState.power_primary) {
        if (currentState.power_secondary) {
          await self.sendContactorUpdate(false, false, null);
          await Tools.delay(5000);
          await self.sendContactorUpdate(true, false, false);
          await Tools.delay(15000);
          await self.sendContactorUpdate(true, true, false);
          self.knownStates.systemState = SysState.Primary;
        } else {
          await self.sendContactorUpdate(true, false, false);
          await Tools.delay(5000);
          await self.sendContactorUpdate(true, true, false);
          self.knownStates.systemState = SysState.Primary;
        }
      } else {
        if (currentState.power_secondary) {
          await self.sendContactorUpdate(false, true, true);
          self.knownStates.systemState = SysState.Secondary;
        } else {
          await self.sendContactorUpdate(false, false, false);
          await Tools.delay(5000);
          await self.sendContactorUpdate(false, false, true);
          await Tools.delay(15000);
          currentState = self.inputs.getState();
          if (!currentState.power_secondary) {
            await self.sendContactorUpdate(true, true, false);
            await self.log.error(
              "FAILED TO START GENERATOR: RESTART BSB TO RE-AQUIRE"
            );
            //return;
          } else {
            await Tools.delay(15000);
            await self.sendContactorUpdate(false, true, true);
            self.knownStates.systemState = SysState.Secondary;
          }
        }
      }
      if (self.knownStates.systemState === SysState.Unknown) {
        self.knownStates.systemError = true;
      } else {
        self.knownStates.systemError = false;
      }
      self.knownStates.systemBusy = false;
    }, 1000);
    this.loadSheddingTimer = setInterval(async () => {
      self.runLoadSheddingUpdater();
    }, 60000);
    this.counterTimer = setInterval(async () => {
      let currentState = self.inputs.getState();
      if (currentState.power_secondary)
        self.knownStates.contactor_generator_time++;
      else self.knownStates.contactor_generator_time = 0;
      if (self.knownStates.systemError) {
        await self.log.error("CANNOT FUNCTION: SYSTEM ERROR");
        return;
      }
      if (self.knownStates.systemBusy) return;
      self.knownStates.systemBusy = true;
      let relayStates = self.outputs.getState();

      await self.log.info('RUNNING SYSTEM CHECK');
      if (currentState.power_primary) {
        if (relayStates.contactor_primary) { // negative power
          if (currentState.power_secondary) {
            await self.log.info(' - RETURN TO PRIMARY');
            //if (!self.knownStates.systemPreppedForLoadShedding) {
            await Tools.delay(120000);
            currentState = self.inputs.getState();
            if (currentState.power_primary) {
              await self.sendContactorUpdate(false, false, null);
              await Tools.delay(5000);
              await self.sendContactorUpdate(true, false, null);
              await Tools.delay(30000);
              await self.sendContactorUpdate(true, false, false);
              self.knownStates.systemState = SysState.Primary;
            } else {
              await self.log.warn('POWER FAILED TO RESTORE');
            }
            //}
          } else {
            await self.log.info(' - SET TO PRIMARY');
            await self.sendContactorUpdate(false, false, false);
            await Tools.delay(5000);
            await self.sendContactorUpdate(true, false, false);
            await Tools.delay(5000);
            await self.sendContactorUpdate(true, true, false);
            self.knownStates.systemState = SysState.Primary;
          }
        }
      } else {
        if (relayStates.contactor_secondary) { // negative power
          await self.log.info(' - CHECK SECONDARY');
          await self.sendContactorUpdate(false, null, null);
          if (currentState.power_secondary) {
            await self.log.info(' - RESTORE TO SECONDARY');
            // geni most likely running
            await Tools.delay(5000);
            await self.sendContactorUpdate(false, true, true);
            self.knownStates.systemState = SysState.Secondary;
            self.knownStates.systemPreppedForLoadShedding = false;
          } else {
            await self.log.info(' - ACTIVATE GENERATOR');
            await self.sendContactorUpdate(false, false, true);
            await Tools.delay(15000);
            currentState = self.inputs.getState();
            if (!currentState.power_secondary) {
              await self.sendContactorUpdate(false, false, false);
              await self.sendContactorUpdate(true, true, false);
              await self.log.error(
                "FAILED TO START GENERATOR: RESTART BSB TO RE-AQUIRE"
              );
              self.knownStates.systemError = true;
            } else {
              await self.log.info(' - ACTIVATE SECONDARY');
              await Tools.delay(45000);
              await self.sendContactorUpdate(false, true, true);
              self.knownStates.systemState = SysState.Secondary;
              self.knownStates.systemPreppedForLoadShedding = false;
            }
          }
        } else if (!currentState.power_secondary) {
          await self.log.error(
            "NO POWER ON SECONDARY!"
          );
          await self.sendContactorUpdate(false, false, false);
        }
      }

      self.knownStates.systemBusy = false;
      // self.knownStates.counter_last_db_power--;
      // self.knownStates.counter_last_lastPing--;
      // if (
      //   self.knownStates.contactor_generator === true &&
      //   self.knownStates.contactor_generator_time === 0
      // ) {
      //   self.knownStates.contactor_generator_time = new Date().getTime();
      // } else if (self.knownStates.contactor_generator === false) {
      //   self.knownStates.contactor_generator_time = 0;
      // }
    }, 1000);
    this.runLoadSheddingUpdater();
  }
}
