import { Service, SysState } from "./plugin";
import { Tools } from "@bettercorp/tools";
import { fastify } from "@bettercorp/service-base-plugin-web-server";

export class Web {
  private _fastify!: fastify;
  private uSelf: Service;
  constructor(self: Service) {
    this.uSelf = self;
    this._fastify = new fastify(self);
  }

  async init() {
    await this.getSetLoadshedding();
    await this.generator();
    await this.other();
    await this.getStates();
  }

  private async getSetLoadshedding() {
    const self = this.uSelf;
    await this._fastify.get("/loadshedding/:stage/", async (reply, params) => {
      let stage = Number.parseInt(params.stage || "-5");
      if (stage < 0 || stage > 8) return reply.status(200).send("UNKNOWN");
      self.loadShedding.updateStage(stage);
      self.runLoadSheddingUpdater();
      return reply.redirect("/");
    });
  }
  private async getStates() {
    const self = this.uSelf;
    await this._fastify.get("//", async (reply) => {
      reply.header("content-type", "text/html");
      let lines: Array<string> = ["<h1>ATS System</h1>", "<br />"];

      const knownStates = self.knownStates as any;
      lines.push('<h5 style="display: inline-block;">KNOWN STATES</h5>');
      for (let key of Object.keys(knownStates)) {
        let state: any = undefined;
        if (Tools.isBoolean(knownStates[key])) {
          state = knownStates[key] == true ? "ON" : "OFF";
        } else if (["systemState"].indexOf(key) >= 0) {
          state =
            knownStates[key] === SysState.Primary
              ? "PRIMARY"
              : knownStates[key] === SysState.Secondary
              ? "SECONDARY"
              : "UNKNOWN";
        } else if (
          ["last_db_power", "lastPing", "contactor_generator_time"].indexOf(
            key
          ) >= 0
        ) {
          state = new Date(knownStates[key]).toLocaleString();
        } else if (Tools.isNumber(knownStates[key])) {
          state = knownStates[key].toString();
        } else {
          state = knownStates[key];
        }

        lines.push(
          '<b style="display: inline-block;">' +
            key +
            ":</b>" +
            (state || "UNKNOWN")
        );
      }
      const loadSheddingState = self.loadSheddingState as any;
      lines.push('<h5 style="display: inline-block;">LOAD SHEDDING</h5>');
      for (let key of Object.keys(loadSheddingState)) {
        let state: any = undefined;
        if (Tools.isBoolean(loadSheddingState[key])) {
          state = loadSheddingState[key] == true ? "YES" : "NO";
        } else if (Tools.isNumber(loadSheddingState[key])) {
          state = loadSheddingState[key].toString();
        } else {
          state = loadSheddingState[key];
        }

        lines.push(
          '<b style="display: inline-block;">' +
            key +
            ":</b>" +
            (state || "UNKNOWN")
        );
      }
      const inputs = self.inputs.getState() as any;
      lines.push('<h5 style="display: inline-block;">INPUTS</h5>');
      for (let key of Object.keys(inputs)) {
        let state: any = undefined;
        if (Tools.isBoolean(inputs[key])) {
          state = inputs[key] == true ? "YES" : "NO";
        } else if (Tools.isNumber(inputs[key])) {
          state = inputs[key].toString();
        } else {
          state = inputs[key];
        }

        lines.push(
          '<b style="display: inline-block;">' +
            key +
            ":</b>" +
            (state || "UNKNOWN")
        );
      }
      const outputs = self.outputs.getState() as any;
      lines.push('<h5 style="display: inline-block;">OUTPUTS</h5>');
      for (let key of Object.keys(outputs)) {
        let state: any = undefined;
        if (Tools.isBoolean(outputs[key])) {
          state = outputs[key] == true ? "YES" : "NO";
        } else if (Tools.isNumber(outputs[key])) {
          state = outputs[key].toString();
        } else {
          state = outputs[key];
        }

        lines.push(
          '<b style="display: inline-block;">' +
            key +
            ":</b>" +
            (state || "UNKNOWN")
        );
      }
      lines.push('<h5 style="display: inline-block;">INFO</h5>');
      lines.push(
        '<b style="display: inline-block;">TIME:</b>' +
          new Date().toLocaleString()
      );
      reply.send(
        '<html><head><meta http-equiv="refresh" content="1"></head><body>' +
          lines.join("<br />") +
          "</body></html>"
      );
    });
  }

  private async generator() {
    const self = this.uSelf;
    await this._fastify.get(
      "/generator/:state/",
      async (reply, params, query) => {
        if (query.f !== "1" && self.knownStates.systemBusy)
          return reply.status(500).send("BUSY");
        let stage = Number.parseInt(params.state || "-5");
        if (stage < 0 || stage > 1) return reply.status(400).send("UNKNOWN");
        self.knownStates.systemBusy = true;
        if (stage === 0) {
          await self.sendContactorUpdate(false, false, false);
          await Tools.delay(5000);
          await self.sendContactorUpdate(true, false, false);
          await Tools.delay(5000);
          await self.sendContactorUpdate(true, true, false);
        } else if (stage === 1) {
          await self.sendContactorUpdate(false, false, true);
          await Tools.delay(15000);
          await self.sendContactorUpdate(false, true, true);
        }
        self.knownStates.systemError = false;
        self.knownStates.systemBusy = false;
        return reply.status(202).send("I DONT KNOW");
      }
    );
  }
  private async other() {
    // await this._fastify.post("/test/", async (reply, params, query, body) => {
    //   self.handleParsedData(body);
    //   reply.status(202).send();
    // });
    // await this._fastify.post("/test2/", async (reply, params, query, body) => {
    //   self.parseData(body.data);
    //   reply.status(202).send();
    // });
    // await this._fastify.get("/force/:state/", async (reply, params, query) => {
    //   if (!self.activatedCheckState && query.f !== "1")
    //     return reply.status(500).send("WAITING ON DATA - ?f=1 to override");
    //   let stage = Number.parseInt(params.state || "-5");
    //   if (stage < -1 || stage > 1) return reply.status(200).send("UNKNOWN");
    //   this.knownStates.systemState = stage as SysState;
    //   this.knownStates.systemBusy = true;
    //   if (stage === 0) {
    //     this.knownStates.contactor_primary = false;
    //     this.knownStates.contactor_secondary = false;
    //     await this.sendContactorUpdate("force-wset-1");
    //     await Tools.delay(5000);
    //     this.knownStates.contactor_primary = true;
    //     this.knownStates.contactor_generator = false;
    //     await this.sendContactorUpdate("force-wset-2");
    //     await Tools.delay(5000);
    //     this.knownStates.contactor_secondary = true;
    //     await this.sendContactorUpdate("force-wset-3");
    //   } else if (stage === 1) {
    //     this.knownStates.contactor_primary = false;
    //     this.knownStates.contactor_secondary = false;
    //     this.knownStates.contactor_generator = true;
    //     await this.sendContactorUpdate("force-wset-4");
    //     await Tools.delay(10000);
    //     if (!this.knownStates.power_secondary) {
    //       this.knownStates.contactor_generator = false;
    //     } else {
    //       await Tools.delay(5000);
    //       this.knownStates.contactor_secondary = true;
    //     }
    //     await this.sendContactorUpdate("force-wset-5");
    //     await Tools.delay(5000);
    //   }
    //   this.knownStates.systemBusy = false;
    //   //await this.setState(this.knownStates.systemState);
    //   return reply.status(202).send("OK");
    // });
  }
}
