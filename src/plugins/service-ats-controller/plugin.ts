import {
  IPluginLogger,
  ServiceCallable,
  ServicesBase,
} from "@bettercorp/service-base";
import { MyPluginConfig } from "./sec.config";
import { serialPort } from "@bettercorp/service-base-plugin-serial";
import { raspPIGPIO } from "@bettercorp/service-base-plugin-raspverry-pi-gpio";
import { Tools } from "@bettercorp/tools";
import { fastify } from "@bettercorp/service-base-plugin-web-server";
import * as tx2 from "tx2";
import { loadshedding } from "./loadshedding";

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

export enum SysState {
  Unknown = "Unknown",
  Primary = "Primary",
  Secondary = "Secondary",
}

export class Service extends ServicesBase<
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  MyPluginConfig
> {
  private loadShedding!: loadshedding;
  private _serialPort!: serialPort;
  private _gpio!: raspPIGPIO;
  private _fastify!: fastify;
  //private knownStates_old: any = null;
  private metrics: any = {};
  private loadSheddingState = {
    currentStage: 0,
    inLoadShedding: false,
    timeHUntilNextLS: 0,
    timeMUntilNextLS: 0,
  };
  private knownStates = {
    systemBusy: false,
    systemState: SysState.Unknown,

    contactor_primary: true,
    contactor_secondary: true,
    contactor_generator: false,
    contactor_generator_time: 0,
    //contactor_generator_last_warmupTime: 0,
    //contactor_generator_startup_count: 0,

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
    counter_last_lastPing: Number.MIN_VALUE,
  };
  //private lastPing: number = 0;
  private pingTimer: NodeJS.Timer | null = null;
  private counterTimer: NodeJS.Timer | null = null;
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);
    this._serialPort = new serialPort(this);
    this._gpio = new raspPIGPIO(this);
    this._fastify = new fastify(this);

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
          if (Tools.isBoolean((self.knownStates as any)[key])) {
            return (self.knownStates as any)[key] == true ? 1 : 0;
          }
          return (self.knownStates as any)[key];
        },
      });
    }
  }

  private _geniContactorTimer: NodeJS.Timer | null = null;
  public override dispose(): void {
    if (this._geniContactorTimer !== null)
      clearInterval(this._geniContactorTimer);
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    if (this.counterTimer !== null) clearInterval(this.counterTimer);
  }

  private async setState(systemState: SysState) {
    if (this.knownStates.systemBusy)
      return await this.log.warn("Cannot change state, busy");
    this.knownStates.systemState = systemState;

    await this.log.warn("set system state: {state}", { state: systemState });
    switch (systemState) {
      case SysState.Primary:
        {
          const requiresDelay =
            this.knownStates.contactor_secondary === true &&
            this.knownStates.power_secondary === true &&
            this.knownStates.power_DB === true;
          this.knownStates.contactor_primary = false;
          this.knownStates.contactor_secondary = false;
          await this.sendContactorUpdate();
          if (requiresDelay) {
            await Tools.delay(5000);
          }
          this.knownStates.contactor_primary = true;
          await this.sendContactorUpdate();
          if (this.knownStates.contactor_generator === true) {
            await Tools.delay(60000);
            this.knownStates.contactor_generator = false;
            await this.sendContactorUpdate();
            await Tools.delay(5000);
          }
          await Tools.delay(5000);
          this.knownStates.contactor_secondary = true;
          await this.sendContactorUpdate();
          this.knownStates.systemBusy = false;
        }
        return;
      case SysState.Secondary:
        {
          this.knownStates.contactor_primary = false;
          this.knownStates.contactor_secondary = false;
          const geniState =
            this.knownStates.power_secondary === true ? true : false;
          this.knownStates.contactor_generator = true;
          await this.sendContactorUpdate();

          let maxWarmupTime = 60; //s
          await Tools.delay(10000);

          maxWarmupTime = maxWarmupTime - 10;
          if (this.knownStates.power_secondary !== true) {
            this.knownStates.contactor_generator = false;
            await this.sendContactorUpdate();
            await Tools.delay(5000);
            maxWarmupTime = maxWarmupTime - 5;
            this.knownStates.contactor_generator = true;
            await this.sendContactorUpdate();
            await Tools.delay(10000);
            maxWarmupTime = maxWarmupTime - 10;
          }
          if (this.knownStates.power_secondary !== true) {
            this.knownStates.contactor_generator = false;
            await this.sendContactorUpdate();
            await Tools.delay(5000);
            maxWarmupTime = maxWarmupTime - 5;
            this.knownStates.contactor_generator = true;
            await this.sendContactorUpdate();
            await Tools.delay(10000);
            maxWarmupTime = maxWarmupTime - 10;
          }

          if (this.knownStates.power_secondary !== true) {
            await this.log.error("FAILED TO START GENERATOR");
            this.knownStates.contactor_generator = false;
            this.knownStates.contactor_primary = true;
            this.knownStates.contactor_secondary = true;
            await this.log.error(
              "FAILED TO ANY STATE, WAITING ON KNOWLEDGEMENT"
            );
            await this.sendContactorUpdate();
            this.knownStates.systemBusy = false;
            return;
          }

          if (geniState) {
            await this.log.warn("Geni was already running, we`ll skip to on");
            await Tools.delay(10000);
          } else {
            await this.log.warn("GENERATOR WARMUP");
            await Tools.delay((maxWarmupTime > 10 ? maxWarmupTime : 10) * 1000);
          }
          this.knownStates.contactor_secondary = true;
          await this.sendContactorUpdate();
          this.knownStates.systemBusy = false;
        }
        return;
    }

    this.knownStates.systemBusy = false;
  }

  private async checkState() {
    if (this.knownStates.systemBusy)
      return await this.log.warn("Cannot check state, busy");
    await this.log.warn("checking sys state [{state}]", {
      state: this.knownStates.systemState,
    });
    this.knownStates.systemBusy = true;
    if (this.knownStates.systemState === SysState.Unknown) {
      if (this.knownStates.power_primary) {
        if (this.knownStates.power_secondary) {
          this.knownStates.contactor_generator = false;
          this.knownStates.contactor_primary = false;
          this.knownStates.contactor_secondary = false;
          await this.sendContactorUpdate(true);
          await Tools.delay(5000);
          this.knownStates.contactor_primary = true;
          await this.sendContactorUpdate(true);
          await Tools.delay(5000);
          this.knownStates.contactor_secondary = true;
          await this.sendContactorUpdate(true);
          this.knownStates.systemState = SysState.Primary;
          this.knownStates.systemBusy = false;
          return;
        }
        this.knownStates.contactor_generator = false;
        this.knownStates.contactor_primary = true;
        this.knownStates.contactor_secondary = true;
        await this.sendContactorUpdate(true);
        this.knownStates.systemState = SysState.Primary;
        this.knownStates.systemBusy = false;
        return;
      }
      if (!this.knownStates.power_primary) {
        if (this.knownStates.power_secondary)
          this.knownStates.contactor_generator = true;
        this.knownStates.contactor_primary = false;
        this.knownStates.contactor_secondary = true;
        await this.sendContactorUpdate(true);
        this.knownStates.systemState = SysState.Secondary;
        this.knownStates.systemBusy = false;
        return;
      }
    }
    this.knownStates.systemBusy = false;
    if (
      !this.knownStates.power_primary &&
      this.knownStates.systemState !== SysState.Secondary
    ) {
      await this.setState(SysState.Secondary);
      return;
    }
    if (
      this.knownStates.power_primary &&
      this.knownStates.systemState !== SysState.Primary
    ) {
      await this.setState(SysState.Primary);
      return;
    }
  }

  public override async init(): Promise<void> {
    const self = this;
    this.loadShedding = new loadshedding(
      (await this.getPluginConfig()).loadsheddingFile
    );
    await this._serialPort.onMessage(
      async (line: string | Buffer): Promise<any> => {
        let asString =
          typeof line === "string" ? line : Buffer.from(line).toString("utf-8");
        await self.parseData(asString);
      }
    );
    // await this._fastify.post("/test/", async (reply, params, query, body) => {
    //   self.handleParsedData(body);
    //   reply.status(202).send();
    // });
    // await this._fastify.post("/test2/", async (reply, params, query, body) => {
    //   self.parseData(body.data);
    //   reply.status(202).send();
    // });
    await this._fastify.get("/loadshedding/:stage/", async (reply, params) => {
      let stage = Number.parseInt(params.stage || "-5");
      if (stage < 0 || stage > 8) return reply.status(200).send("UNKNOWN");
      this.loadShedding.updateStage(stage);
      return reply.status(202).send("OK");
    });
    await this._fastify.get("//", async (reply) => {
      reply.header("content-type", "text/html");
      let lines: Array<string> = ["<h1>ATS System</h1>", "<br />"];

      for (let key of Object.keys(this.knownStates)) {
        let state: any = undefined;
        if (Tools.isBoolean((self.knownStates as any)[key])) {
          state = (self.knownStates as any)[key] == true ? "ON" : "OFF";
        } else if (
          ["last_db_power", "lastPing", "contactor_generator_time"].indexOf(
            key
          ) >= 0
        ) {
          state = new Date((self.knownStates as any)[key]).toLocaleString();
        } else {
          state = (self.knownStates as any)[key];
        }

        lines.push(
          '<b style="display: inline-block;">' +
            key +
            ":</b>" +
            (state || "UNKNOWN")
        );
      }
      for (let key of Object.keys(this.loadSheddingState)) {
        let state: any = undefined;
        if (Tools.isBoolean((self.knownStates as any)[key])) {
          state = (self.knownStates as any)[key] == true ? "YES" : "NO";
        } else {
          state = (self.knownStates as any)[key];
        }

        lines.push(
          '<b style="display: inline-block;">' +
            key +
            ":</b>" +
            (state || "UNKNOWN")
        );
      }

      reply.send(
        '<html><head><meta http-equiv="refresh" content="5"></head><body>' + lines.join("<br />") + "</body></html>"
      );
    });
  }
  public override async run(): Promise<void> {
    //await this.sendContactorUpdate(true);
    const self = this;
    this.pingTimer = setInterval(async () => {
      if (self.knownStates.lastPing === 0) return;
      const now = new Date().getTime();

      if (now - self.knownStates.lastPing > 70 * 1000) {
        // reset port
        await self.log.fatal("Port still locked. Force restart");
      }
      if (now - self.knownStates.lastPing > 60 * 1000) {
        // reset port
        await self.log.error("Port locked. Force restart");
        await self._serialPort.reconnect();
      }

      self.loadSheddingState.currentStage = self.loadShedding.getStage();
      let timeBeforeLS = self.loadShedding.getTimeUntilNextLoadShedding();
      if (timeBeforeLS <= -1) {
        self.loadSheddingState.inLoadShedding = false;
        self.loadSheddingState.timeHUntilNextLS = 0;
        self.loadSheddingState.timeMUntilNextLS = 0;
      } else if (timeBeforeLS === 0) {
        self.loadSheddingState.inLoadShedding = true;
        self.loadSheddingState.timeHUntilNextLS = 0;
        self.loadSheddingState.timeMUntilNextLS = 0;
      } else {
        self.loadSheddingState.inLoadShedding = false;

        timeBeforeLS = timeBeforeLS / 1000; // s
        timeBeforeLS = timeBeforeLS / 60; // m
        let timeBeforeLSH = timeBeforeLS / 60; // h

        if (
          timeBeforeLS < 6 &&
          self.knownStates.contactor_generator === false
        ) {
          self.knownStates.contactor_generator = true;
          await self.sendContactorUpdate(true);
        }

        self.loadSheddingState.timeHUntilNextLS = timeBeforeLSH;
        self.loadSheddingState.timeMUntilNextLS =
          timeBeforeLS - timeBeforeLSH * 60;
      }

      if (
        !self.knownStates.systemBusy &&
        self.knownStates.power_primary === true &&
        new Date().getTime() - self.knownStates.contactor_generator_time >
          20 * 60 * 1000
      ) {
        // 20 min
        self.knownStates.systemState = SysState.Unknown;
        self.checkState();
      }
    }, 60000);
    this.counterTimer = setInterval(async () => {
      self.knownStates.counter_last_db_power--;
      self.knownStates.counter_last_lastPing--;
      if (
        self.knownStates.contactor_generator === true &&
        self.knownStates.contactor_generator_time === 0
      ) {
        self.knownStates.contactor_generator_time = new Date().getTime();
      } else if (self.knownStates.contactor_generator === false) {
        self.knownStates.contactor_generator_time = 0;
      }
    }, 1000);
  }

  private async parseData(asString: string): Promise<any> {
    const self = this;
    if (asString.indexOf("[") < 0 || asString.indexOf("]") < 0)
      return undefined;

    let data = asString.split("[")[1].split("]")[0].split(":");
    await self.log.info("Known state: {state}", { state: asString });
    switch (data[0]) {
      case "PING":
        {
          self.knownStates.lastPing = new Date().getTime();
          self.knownStates.counter_last_lastPing = 0;
          await self.log.info("PING Received: ");
        }
        break;
      case "STATE":
        {
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
        break;
    }
    await this.checkState();
  }
  private statesOfRelays: Array<{
    pin: number;
    state: boolean;
  }> = [];
  private prevStatesOfRelays: Array<{
    pin: number;
    state: boolean;
  }> = [];
  private async sendContactorUpdate(force: boolean = false) {
    let pins: Array<{
      pin: number;
      state: boolean;
    }> = [];

    pins.push({
      pin: 4,
      state: !this.knownStates.contactor_primary,
    });
    pins.push({
      pin: 22,
      state: !this.knownStates.contactor_secondary,
    });
    pins.push({
      pin: 6,
      state: this.knownStates.contactor_generator,
    });

    this.statesOfRelays = pins;
    //if (force)
    await this.sendContactorUpdateFinal();
    //await this._gpio.setPinsState(pins);
  }
  private async sendContactorUpdateFinal() {
    const self = this;
    let filtered = this.statesOfRelays.filter((x) => {
      for (let prevItem of self.prevStatesOfRelays) {
        if (prevItem.pin === x.pin) return x.state !== prevItem.state;
      }
      return true;
    });

    if (filtered.length > 0) {
      this.prevStatesOfRelays = this.statesOfRelays;
      console.log(filtered);
      await this._gpio.setPinsState(filtered);
    }
  }

  private async handleParsedData(data: ParsedState) {
    const self = this;

    if (
      !this.knownStates.power_secondary &&
      data.secondary.power &&
      !this.knownStates.contactor_generator
    ) {
      setTimeout(async () => {
        if (
          !this.knownStates.power_secondary ||
          this.knownStates.contactor_generator
        )
          return;

        self.knownStates.contactor_generator = true;
        await self.sendContactorUpdate(true);
      }, 30000);
    }

    this.knownStates.power_UPS = data.ups_out.power;
    this.knownStates.power_blue_house = data.blue_house.power;
    this.knownStates.power_blue_core = data.blue_core.power;
    this.knownStates.power_DB = data.db_in.power;
    this.knownStates.power_DB_red = data.db_red.power;
    this.knownStates.power_red_house = data.red.power;
    this.knownStates.power_primary = data.primary.power;
    this.knownStates.power_secondary = data.secondary.power;

    //if (this.knownStates_old === null) this.knownStates_old = this.knownStates;

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
