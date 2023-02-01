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
      lines.push(
        '<div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: flex-start; align-items: flex-start; align-content: flex-start; gap: 10px; ">'
      );
      lines.push(
        "<style>.item { background: white; border-radius: 10px; box-shadow: 0px 10px 15px -3px rgba(0,0,0,0.1); padding: 20px; }</style>"
      );
      lines.push(
        "<style>.item h5 { display: block; margin: 0; margin-bottom: 10px; font-size: 20px; }</style>"
      );
      lines.push("<style>.item > br { display: none; }</style>");
      lines.push(
        "<style>.item > .litem { display: block; padding-bottom: 7px; }</style>"
      );
      lines.push(
        "<style>.item > .litem > b, .item > .litem > span { display: inline-block; }</style>"
      );
      lines.push("<style>.item > .litem > span { float: right }</style>");
      lines.push('<div class="item">');
      lines.push("<h5>KNOWN STATES</h5>");
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
          `<div class="litem"><b>${key}</b>: <span>${
            state || "UNKNOWN"
          }</span></div>`
        );
      }
      lines.push(`<b>TIME</b>: <span>${new Date().toLocaleString()}</span>`);
      lines.push("</div>");
      lines.push('<div class="item">');
      const loadSheddingState = self.loadSheddingState as any;
      lines.push("<h5>LOAD SHEDDING</h5>");
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
          `<div class="litem"><b>${key}</b>: <span>${
            state || "UNKNOWN"
          }</span></div>`
        );
      }
      lines.push("</div>");
      lines.push('<div class="item">');
      const inputs = self.inputs.getState() as any;
      lines.push("<h5>INPUTS</h5>");
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
          `<div class="litem"><b>${key}</b>: <span>${
            state || "UNKNOWN"
          }</span></div>`
        );
      }
      lines.push("</div>");
      lines.push('<div class="item">');
      const outputs = self.outputs.getState() as any;
      lines.push("<h5>OUTPUTS</h5>");
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
          `<div class="litem"><b>${key}</b>: <span>${
            state || "UNKNOWN"
          }</span></div>`
        );
      }
      lines.push("</div>");
      // lines.push('<div class="item">');
      // lines.push('<h5>INFO</h5>');
      // lines.push(
      //   '<b style="display: inline-block;">TIME:</b>' +
      //     new Date().toLocaleString()
      // );
      // lines.push('</div>');
      lines.push('<div class="item">');
      lines.push("<h5>SYSTEM STATE LOGS</h5>");
      // loop through _latestSystemBusyPoint with an index, make the first item bold, and the rest normal
      for (let index = 0; index < self._latestSystemBusyPoint.length; index++) {
        let workingContent = self._latestSystemBusyPoint[index].split(":");
        lines.push(
          `<b>${workingContent
            .splice(0, 1)[0]
            .trim()}</b>: <span>${workingContent.join(":").trim()}</span>`
        );
      }
      lines.push("</div>");
      lines.push("</div>");
      reply.send(
        '<html><head><meta http-equiv="refresh" content="1"></head><body style="background: rgb(242, 242, 242);">' +
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
