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
import axios from "axios";

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
    startGeniMinBeforeLS: 0,
    startGeniMinLSCounter: 0,

    nextLSStartTime: "",
    nextLSEndTime: "",
    estLSStage: 0,
    estLSStartTime: "",
    estLSEndTime: "",
  };
  public knownStates = {
    systemBusy: false,
    systemError: false,
    systemPreppedForLoadShedding: false,
    systemCurrentState: SysState.Unknown,
    generator_runtime: 0,
    generator_runtime_notinuse: 0,
    //contactor_generator_last_warmupTime: 0,
    //contactor_generator_startup_count: 0,
  };
  public _latestSystemBusyPoint: Array<string> = ["boot"];
  public set latestSystemBusyPoint(value: string) {
    if (value.indexOf(":") < 0) return;
    this._latestSystemBusyPoint.unshift(value);
    if (this._latestSystemBusyPoint.length > 50) {
      this._latestSystemBusyPoint = this._latestSystemBusyPoint.splice(0, 50);
    }

    this.fireAPIEvent(value);
  }
  public get systemState(): SysState {
    return this.knownStates.systemCurrentState;
  }
  public set systemState(value: SysState) {
    this.knownStates.systemCurrentState = value;
    this.latestSystemBusyPoint =
      "System State : " +
      (value === SysState.Primary
        ? "Primary"
        : value === SysState.Secondary
        ? "Secondary"
        : "Unknown");
  }
  private fireAPIEvent = async (event: string) => {
    const logApiEndpoint = (await this.getPluginConfig()).logApiEndpoint;
    if (logApiEndpoint === undefined) return;
    const self = this;
    setTimeout(async () => {
      try {
        await axios.post(logApiEndpoint, {
          event,
        });
      } catch (e: any) {
        await self.log.error(e);
      }
    }, 1);
  };

  private loadSheddingTimer: NodeJS.Timer | null = null;
  private counterTimer: NodeJS.Timer | null = null;
  public loadShedding!: loadshedding;
  public outputs: Outputs;
  public inputs: Inputs;
  private web: Web;
  public get pluginCWD(): string {
    return this.pluginCwd;
  }
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);
    const self = this;
    this.outputs = new Outputs(this);
    this.inputs = new Inputs(this, (value: string) => {
      self.latestSystemBusyPoint = value;
    });
    this.web = new Web(this);

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
  //   this.systemState = systemState;

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
    this.latestSystemBusyPoint = `Set : P:${
      contactor_primary !== null ? (contactor_primary ? "1" : "0") : "_"
    } S:${
      contactor_secondary !== null ? (contactor_secondary ? "1" : "0") : "_"
    } G:${
      contactor_generator !== null ? (contactor_generator ? "1" : "0") : "_"
    }`;
    const self = this;
    await this.outputs.setState(
      {
        contactor_primary:
          contactor_primary !== null ? !contactor_primary : null,
        contactor_secondary:
          contactor_secondary !== null ? !contactor_secondary : null,
        contactor_generator: contactor_generator,
      },
      (value: string) => {
        self.latestSystemBusyPoint = value;
      }
    );
  }

  public override async init(): Promise<void> {
    //this.outputs.sendSms = await (await this.getPluginConfig()).sendGeniSMS;
    const self = this;
    this.loadShedding = new loadshedding(
      /*(await this.getPluginConfig()).loadsheddingFile,*/
      (value: string) => {
        self.latestSystemBusyPoint = value;
      },
      (await this.getPluginConfig()).espAPIKey,
      (await this.getPluginConfig()).espAPILocation,
      (await this.getPluginConfig()).espAPILimitPerDay,
      this.log
    );
    this.loadSheddingState.startGeniMinBeforeLS = (
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
    let timeBeforeDetail =
      self.loadShedding.getTimeUntilNextLoadSheddingDetailed();
    let timeBeforeLS = timeBeforeDetail.timeUntil;
    await self.log.info("Time before LS: {LST}", { LST: timeBeforeLS });
    if (timeBeforeLS <= -1) {
      self.loadSheddingState.nextLSStartTime = "";
      self.loadSheddingState.nextLSEndTime = "";
      self.loadSheddingState.inLoadShedding = false;
      self.loadSheddingState.timeHUntilNextLS = 0;
      self.loadSheddingState.timeMUntilNextLS = 0;
      self.loadSheddingState.startGeniMinLSCounter = -3;
    } else if (timeBeforeLS === 0) {
      self.loadSheddingState.nextLSStartTime = "";
      self.loadSheddingState.nextLSEndTime = "";
      self.loadSheddingState.inLoadShedding = true;
      self.loadSheddingState.timeHUntilNextLS = 0;
      self.loadSheddingState.timeMUntilNextLS = 0;
      self.loadSheddingState.startGeniMinLSCounter = -1;
    } else {
      self.loadSheddingState.inLoadShedding = false;
      self.loadSheddingState.nextLSStartTime = timeBeforeDetail.startTime;
      self.loadSheddingState.nextLSEndTime = timeBeforeDetail.endTime;

      timeBeforeLS = timeBeforeLS / 1000; // s
      timeBeforeLS = timeBeforeLS / 60; // m
      let timeBeforeLSH = Math.floor(timeBeforeLS / 60); // h

      self.loadSheddingState.startGeniMinLSCounter =
        Math.round(timeBeforeLS - self.loadSheddingState.startGeniMinBeforeLS);
      if (self.loadSheddingState.startGeniMinLSCounter < 0)
        self.loadSheddingState.startGeniMinLSCounter = -2;

      let relayStates = self.outputs.getState();
      let powerStates = self.inputs.getState();

      if (
        timeBeforeLS <= self.loadSheddingState.startGeniMinBeforeLS &&
        relayStates.contactor_generator === false &&
        powerStates.power_secondary === false
      ) {
        if (!self.knownStates.systemBusy) {
          self.knownStates.systemBusy = true;
          self.latestSystemBusyPoint =
            "Load shedding updator : trigger generator";
          await self.log.warn("starting geni in prep for load shedding");
          await self.sendContactorUpdate(null, false, true);
          await Tools.delay(15000);
          powerStates = self.inputs.getState();
          self.latestSystemBusyPoint =
            "Load shedding updator : check generator";
          if (!powerStates.power_secondary) {
            await self.sendContactorUpdate(null, true, false);
            await self.log.error("FAILED TO PREP GENI FOR LOAD SHEDDING!");
          } else {
            self.knownStates.systemPreppedForLoadShedding = true;
          }
          self.latestSystemBusyPoint =
            "Load shedding updator : generator started";
          await Tools.delay(5000);
          self.knownStates.systemBusy = false;
        }
      }

      self.loadSheddingState.timeHUntilNextLS = timeBeforeLSH;
      self.loadSheddingState.timeMUntilNextLS = Math.round(
        timeBeforeLS - timeBeforeLSH * 60
      );
    }

    let timeBeforeEstimated =
      self.loadShedding.getTimeUntilNextLoadSheddingDetailedIf() ?? {
        stage: 0,
        startTime: "",
        endTime: "",
      };
    self.loadSheddingState.estLSStage = timeBeforeEstimated.stage;
    self.loadSheddingState.estLSStartTime = timeBeforeEstimated.startTime;
    self.loadSheddingState.estLSEndTime = timeBeforeEstimated.endTime;

    // if (
    //   !self.knownStates.systemBusy &&
    //   self.knownStates.power_primary === true &&
    //   self.systemState === SysState.Primary &&
    //   self.knownStates.contactor_generator === true &&
    //   new Date().getTime() - self.knownStates.contactor_generator_time >
    //     (self.loadSheddingState.startGeniMinutesBeforeLoadShedding + 10) *
    //       60 *
    //       1000
    // ) {
    //   // 10+ min
    //   self.systemState = SysState.Primary;
    //   self.checkState();
    // }
  }
  public override async run(): Promise<void> {
    //await this.sendContactorUpdate(true);
    const self = this;
    this.knownStates.systemBusy = true;
    self.latestSystemBusyPoint = "System Run : system check";
    setTimeout(async () => {
      self.latestSystemBusyPoint = "System Run : init system";
      await this.log.warn("checking sys state [{state}]", {
        state: this.systemState,
      });
      self.latestSystemBusyPoint = "System Run : wait for inputs";
      while (!self.inputs.isReady) await Tools.delay(1000);
      let currentState = self.inputs.getState();

      self.latestSystemBusyPoint = "System Run : set state";
      if (currentState.power_primary) {
        if (currentState.power_secondary) {
          self.latestSystemBusyPoint = "System Run : restore to primary";
          await self.sendContactorUpdate(false, false, null);
          await Tools.delay(5000);
          self.latestSystemBusyPoint =
            "System Run : restore to primary : switch off geni";
          await self.sendContactorUpdate(true, false, false);
          await Tools.delay(15000);
          self.latestSystemBusyPoint =
            "System Run : restore to primary : final";
          await self.sendContactorUpdate(true, true, false);
          self.systemState = SysState.Primary;
          self.latestSystemBusyPoint =
            "System Run : restore to primary : complete";
        } else {
          self.latestSystemBusyPoint = "System Run : activate primary";
          await self.sendContactorUpdate(true, false, false);
          await Tools.delay(5000);
          await self.sendContactorUpdate(true, true, false);
          self.latestSystemBusyPoint =
            "System Run : activate primary : complete";
          self.systemState = SysState.Primary;
        }
      } else {
        if (currentState.power_secondary) {
          await self.sendContactorUpdate(false, true, true);
          self.systemState = SysState.Secondary;
        } else {
          self.latestSystemBusyPoint = "System Run : restore to secondary";
          await self.sendContactorUpdate(false, false, false);
          await Tools.delay(5000);
          self.latestSystemBusyPoint =
            "System Run : restore to secondary : start generator";
          await self.sendContactorUpdate(false, false, true);
          await Tools.delay(15000);
          currentState = self.inputs.getState();
          self.latestSystemBusyPoint =
            "System Run : restore to secondary : check generator";
          if (!currentState.power_secondary) {
            await self.sendContactorUpdate(true, true, false);
            self.latestSystemBusyPoint =
              "System Run : restore to secondary : fail safe";
            await self.log.error(
              "FAILED TO START GENERATOR: RESTART BSB TO RE-AQUIRE"
            );
            //return;
          } else {
            await Tools.delay(15000);
            self.latestSystemBusyPoint =
              "System Run : restore to secondary: complete";
            await self.sendContactorUpdate(false, true, true);
            self.systemState = SysState.Secondary;
          }
        }
      }
      if (self.systemState === SysState.Unknown) {
        self.knownStates.systemError = true;
      } else {
        self.knownStates.systemError = false;
      }
      self.latestSystemBusyPoint = "";
      self.knownStates.systemBusy = false;
    }, 500);
    self.latestSystemBusyPoint = "System Run : setup timers";
    this.loadSheddingTimer = setInterval(async () => {
      self.runLoadSheddingUpdater();
    }, 60000);
    this.counterTimer = setInterval(async () => {
      let currentState = self.inputs.getState();
      let relayStates = self.outputs.getState();

      if (currentState.power_secondary) self.knownStates.generator_runtime++;
      else self.knownStates.generator_runtime = 0;

      if (currentState.power_secondary && !relayStates.contactor_secondary)
        self.knownStates.generator_runtime++;
      else self.knownStates.generator_runtime_notinuse = 0;

      if (self.knownStates.generator_runtime_notinuse > 15 * 60) {
        await self.log.warn(
          "GENERATOR RUNNING FOR MORE THAN 15 MINUTES WITHOUT BEING IN USE... WE ARE GOING TO SHUT IT DOWN"
        );
        await self.sendContactorUpdate(null, null, false);
      }

      if (self.knownStates.systemError) {
        await self.log.error("CANNOT FUNCTION: SYSTEM ERROR");
        return;
      }
      if (self.knownStates.systemBusy) {
        await self.log.warn(" - system busy....");
        return;
      }
      self.knownStates.systemBusy = true;
      ///self.latestSystemBusyPoint = "System check : check state - " + new Date().toString();

      await self.log.debug("RUNNING SYSTEM CHECK");
      if (currentState.power_primary) {
        if (!relayStates.contactor_primary) {
          if (currentState.power_secondary) {
            self.latestSystemBusyPoint =
              "System check : restore primary : 120s check";
            await self.log.info(" - RETURN TO PRIMARY");
            //if (!self.knownStates.systemPreppedForLoadShedding) {
            await Tools.delay(120000);
            currentState = self.inputs.getState();
            self.latestSystemBusyPoint =
              "System check : restore primary : check primary still powered";
            if (currentState.power_primary) {
              self.latestSystemBusyPoint =
                "System check : restore primary : disable all relays";
              await self.sendContactorUpdate(false, false, null);
              await Tools.delay(5000);
              self.latestSystemBusyPoint =
                "System check : restore primary : activate primary";
              await self.sendContactorUpdate(true, false, null);
              await Tools.delay(30000);
              self.latestSystemBusyPoint =
                "System check : restore primary : kill geni";
              await self.sendContactorUpdate(true, false, false);
              await Tools.delay(5000);
              await self.sendContactorUpdate(true, true, false);
              self.latestSystemBusyPoint =
                "System check : restore primary : complete";
              self.systemState = SysState.Primary;
            } else {
              self.latestSystemBusyPoint =
                "System check : restore primary : failed to restore";
              await self.log.warn("POWER FAILED TO RESTORE");
            }
            //}
          } else {
            await self.log.info(" - SET TO PRIMARY");
            self.latestSystemBusyPoint =
              "System check : quick primary : restore, all off";
            await self.sendContactorUpdate(false, false, false);
            await Tools.delay(5000);
            self.latestSystemBusyPoint =
              "System check : quick primary : activate primary";
            await self.sendContactorUpdate(true, false, false);
            await Tools.delay(5000);
            await self.sendContactorUpdate(true, true, false);
            self.latestSystemBusyPoint =
              "System check : quick primary : complete";
            self.systemState = SysState.Primary;
          }
        }
      } else {
        if (!relayStates.contactor_secondary) {
          self.latestSystemBusyPoint = "System check : primary off";
          await self.log.info(" - CHECK SECONDARY");
          await self.sendContactorUpdate(false, null, null);
          if (currentState.power_secondary) {
            self.latestSystemBusyPoint =
              "System check : quick secondary : restore";
            await self.log.info(" - RESTORE TO SECONDARY");
            // geni most likely running
            await Tools.delay(5000);
            self.latestSystemBusyPoint =
              "System check : quick secondary : complete:";
            await self.sendContactorUpdate(false, true, null);
            self.systemState = SysState.Secondary;
            self.knownStates.systemPreppedForLoadShedding = false;
          } else {
            self.latestSystemBusyPoint =
              "System check : activate secondary : start generator";
            await self.log.info(" - ACTIVATE GENERATOR");
            await self.sendContactorUpdate(false, false, true);
            await Tools.delay(15000);
            self.latestSystemBusyPoint =
              "System check : activate secondary : check generator";
            currentState = self.inputs.getState();
            if (!currentState.power_secondary) {
              await self.sendContactorUpdate(true, true, false);
              self.latestSystemBusyPoint =
                "System check : activate secondary : generator failed";
              await self.log.error(
                "FAILED TO START GENERATOR: RESTART BSB TO RE-AQUIRE"
              );
              self.knownStates.systemError = true;
            } else {
              self.latestSystemBusyPoint =
                "System check : activate secondary : warming generator";
              await self.log.info(" - ACTIVATE SECONDARY");
              await Tools.delay(45000);
              self.latestSystemBusyPoint =
                "System check : activate secondary : complete";
              await self.sendContactorUpdate(false, true, true);
              self.systemState = SysState.Secondary;
              self.knownStates.systemPreppedForLoadShedding = false;
            }
          }
        } else if (!currentState.power_secondary) {
          self.latestSystemBusyPoint =
            "System check : restore secondary : failed, no power";
          await self.log.error("NO POWER ON SECONDARY!");
          await self.sendContactorUpdate(false, false, false);
        }
      }

      self.latestSystemBusyPoint = "";
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
