//import { readFileSync, writeFileSync } from "fs";
import { IPluginLogger } from "@bettercorp/service-base";
import axios from "axios";
import * as moment from "moment";
import { EventEmitter } from "stream";

export interface LSConfigTimes {
  // times are MS from 00:00
  stages: Array<number>;
  startTime: number;
  endTime: number;
}
export interface LSConfig {
  dayOfWeek: number;
  times: Array<LSConfigTimes>;
}
export interface LSDef {
  schedule: Array<LSConfig>;
  currentStage: number;
}
export interface ESPAreaStatus {
  events: ESPAreaStatusEvent[];
  info: ESPAreaStatusInfo;
  schedule: ESPAreaStatusSchedule;
}

export interface ESPAreaStatusEvent {
  end: Date; //string;
  note: string;
  start: Date; //string;
}

export interface ESPAreaStatusInfo {
  name: string;
  region: string;
}

export interface ESPAreaStatusSchedule {
  days: ESPAreaStatusDay[];
  source: string;
}

export interface ESPAreaStatusDay {
  date: string;
  name: string;
  stages: Array<string[]>;
}

export interface ESPStatus {
  status: ESPStatusStatus;
}

export interface ESPStatusStatus {
  capetown: ESPStatusDetails;
  eskom: ESPStatusDetails;
}

export interface ESPStatusDetails {
  name: string;
  next_stages: ESPStatusNextStage[];
  stage: string;
  stage_updated: string;
}

export interface ESPStatusNextStage {
  stage: string;
  stage_start_timestamp: string;
}

// sunday - 0
// monday - 1
// saturday - 6
export class loadshedding {
  log!: IPluginLogger;
  public ESPLSAreaStatus: ESPAreaStatus | null = null;
  public ESPLSStatus: ESPStatus | null = null;
  private handleLog = (value: string) => {};
  emitter: EventEmitter = new EventEmitter();
  /*private readonly loadSheddingFile: string;
  private states = {
    lastStage: -1,
    nextSchedule: "",
  };*/

  private ESPAPIKey: string;
  private LoadSheddingESPID: string;
  private ESPRequestsPerDay = 50;

  private triggerESPUpdate() {
    this.log.info("SYNCING ESP DETAILS");
    const self = this;
    this.handleLog("Sync ESP LS Details");
    axios
      .get(
        "https://developer.sepush.co.za/business/2.0/area?id=" +
          this.LoadSheddingESPID,
        {
          headers: {
            token: this.ESPAPIKey,
          },
        }
      )
      .then(async (resp) => {
        if (resp.status !== 200) {
          self.log.error("ERROR GETTING LS SCHED", resp.data);
          return;
        }
        self.log.warn("SYNCING ESP DETAILS : GOT 1");
        const statusreq = await axios.get(
          "https://developer.sepush.co.za/business/2.0/status",
          {
            headers: {
              token: this.ESPAPIKey,
            },
          }
        );
        self.log.warn("SYNCING ESP DETAILS : GOT 2");
        let result = resp.data;
        self.log.debug(statusreq.data);
        self.log.debug(resp.data);
        for (let index = 0; index < result.events.length; index++) {
          result.events[index].start = new Date(result.events[index].start);
          result.events[index].end = new Date(result.events[index].end);
        }
        this.ESPLSAreaStatus = result as ESPAreaStatus;
        this.ESPLSStatus = statusreq.data as ESPStatus;
        self.log.warn("SYNCING ESP DETAILS : OK");
        /*this.handleLog(
          "Synced ESP known stage: " + this.ESPLSStatus.status.eskom.stage
        );*/
        self.emitter.emit("updated");
      })
      .catch((error) => {
        self.log.error("Error getting load shedding status: ", error);
        this.ESPLSAreaStatus = null;
      });
  }
  private scheduleUpdateInterval: NodeJS.Timeout | null = null;
  constructor(
    /*lsFile: string, */ handleLog: { (value: string): void },
    ESPAPIKey: string,
    LoadSheddingESPID: string,
    ESPRequestsPerDay: number,
    log: IPluginLogger
  ) {
    this.log = log;
    this.log.info("INIT ESP LS API");
    this.ESPAPIKey = ESPAPIKey;
    this.LoadSheddingESPID = LoadSheddingESPID;
    this.ESPRequestsPerDay = ESPRequestsPerDay;
    this.handleLog = handleLog;
    //this.loadSheddingFile = lsFile;
    // Calculate the total milliseconds in a day
    const totalMillisecondsInADay = 24 * 60 * 60 * 1000;
    // Calculate the interval between each request
    const intervalBetweenEachRequest =
      (totalMillisecondsInADay / (this.ESPRequestsPerDay - 4)) * 2;
    this.log.info(
      "Running LS ESP Interval at: " +
        Math.round(intervalBetweenEachRequest / 1000) +
        "s"
    );
    this.scheduleUpdateInterval = setInterval(() => {
      this.triggerESPUpdate();
    }, Math.round(intervalBetweenEachRequest));
    this.triggerESPUpdate();
  }
  dispose() {
    if (this.scheduleUpdateInterval) {
      clearInterval(this.scheduleUpdateInterval);
    }
  }
  updateStage(newStage: number) {
    /*if (newStage < 0 || newStage > 8) return;
    let list = JSON.parse(
      readFileSync(this.loadSheddingFile).toString()
    ) as LSDef;
    list.currentStage = newStage;
    writeFileSync(this.loadSheddingFile, JSON.stringify(list));*/
  }
  private knownStage: number = 0;
  getStage() {
    if (this.ESPLSAreaStatus === null) return -3;
    if (this.ESPLSStatus === null) return -4;
    let stage = 0;
    for (let lsevent of this.ESPLSAreaStatus.events) {
      if (new Date() >= lsevent.start && new Date() <= lsevent.end) {
        stage = Number.parseInt(lsevent.note.split(" ")[1]);
      }
    }
    if (stage === 0) {
      stage = Number.parseInt(this.ESPLSStatus.status.eskom.stage);
    }
    if (this.knownStage !== stage) {
      this.handleLog("Load Shedding Stage: " + this.knownStage + " > " + stage);
      this.knownStage = stage;
    }
    return stage;
    /*let list = JSON.parse(
      readFileSync(this.loadSheddingFile).toString()
    ) as LSDef;
    if (this.states.lastStage !== list.currentStage) {
      this.handleLog("Load Shedding Stage: " + list.currentStage);
      this.states.lastStage = list.currentStage;
    }
    return list.currentStage;*/
  }
  /*getTimeUntilNextLoadShedding(): number {
    return this.getTimeUntilNextLoadSheddingDetailed().timeUntil;
  }*/
  getTimeUntilNextLoadSheddingDetailedIf(): {
    stage: number;
    timeUntil: number;
    startTime: string;
    endTime: string;
  } | null {
    if (this.ESPLSAreaStatus === null) return null;
    const stages = [1, 2, 3, 4, 5, 6, 7, 8];
    let maxUntilLoadSheddingTimeUntil = Number.MAX_VALUE;
    let maxUntilLoadShedding: {
      stage: number;
      timeUntil: number;
      startTime: string;
      endTime: string;
    } | null = null;
    for (let stage of stages) {
      let thisStageInfo = this.getTimeUntilNextLoadSheddingDetailed(stage);
      this.log.info("stage: " + stage, thisStageInfo);
      if (thisStageInfo.timeUntil > 0) {
        if (thisStageInfo.timeUntil < maxUntilLoadSheddingTimeUntil) {
          maxUntilLoadSheddingTimeUntil = thisStageInfo.timeUntil;
          maxUntilLoadShedding = {
            stage,
            ...thisStageInfo,
          };
        }
      }
    }
    return maxUntilLoadShedding;
  }
  /*private scheduleUpdate(schedule: LSConfigTimes, currentDay: number) {
    let dayName = "Today";
    if (new Date().getDay() != currentDay) {
      dayName = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ][currentDay];
    }
    let schedTime = `${dayName} at ${(schedule as any)._startTime}`.trim();
    if (this.states.nextSchedule != schedTime) {
      this.handleLog(`Next load shedding: ${schedTime}`);
      this.states.nextSchedule = schedTime;
    }
  }*/
  lastSentAlert: number = 0;
  getTimeUntilNextLoadSheddingDetailed(stage?: number): {
    timeUntil: number;
    startTime: string;
    endTime: string;
  } {
    if (this.ESPLSAreaStatus === null)
      return { timeUntil: -1, startTime: "00:00", endTime: "00:00" };
    let activeStage = stage ?? this.getStage();
    if (activeStage <= 0)
      return {
        timeUntil: this.getStage(),
        startTime: "00:00",
        endTime: "00:00",
      };

    for (let day = 0; day < this.ESPLSAreaStatus.schedule.days.length; day++) {
      let scheds =
        this.ESPLSAreaStatus.schedule.days[day].stages[activeStage - 1];
      if (scheds.length === 0) continue; //return { timeUntil: -3, startTime: "00:00", endTime: "00:00" };
      for (let sched of scheds) {
        let startTime = sched.split("-")[0];
        let endTime = sched.split("-")[1];
        let dateNow = new Date();
        let timeNow = dateNow.getTime();
        let startTimeDate = moment(startTime, "HH:mm")
          .add(day, "days")
          .toDate()
          .getTime();
        /*let endTimeDate = new Date(
          `${dateNow.getFullYear()}-${dateNow.getMonth() < 9 ? "0" : ""}${
            dateNow.getMonth() + 1
          }-${
            dateNow.getDate() < 10 ? "0" : ""
          }${dateNow.getDate()}T${endTime}:00`
        ).getTime();*/
        /*if (timeNow >= startTimeDate && timeNow <= endTimeDate) {
          return {
            timeUntil: -4,
            startTime,
            endTime,
          };
        }*/
        if (timeNow < startTimeDate) {
          const timeUntil = startTimeDate - timeNow;
          const timeUntilInMinutes = Math.round(timeUntil / 1000 / 60);
          if (stage === undefined && [60, 45, 30, 15, 5].indexOf(timeUntilInMinutes) >= 0) {
            if (this.lastSentAlert !== timeUntilInMinutes)
              this.handleLog(`Next load shedding: ${timeUntilInMinutes}min`);
            else this.lastSentAlert = timeUntilInMinutes;
          }

          return {
            timeUntil,
            startTime,
            endTime,
          };
        }
      }
    }
    return { timeUntil: -5, startTime: "00:00", endTime: "00:00" };

    /*const NOW = new Date();
    // will return 0 if in load shedding // will return -1 if no load shedding
    let list = JSON.parse(
      readFileSync(this.loadSheddingFile).toString()
    ) as LSDef;
    list.schedule = list.schedule
      .sort((a, b) =>
        a.dayOfWeek > b.dayOfWeek ? 1 : a.dayOfWeek < b.dayOfWeek ? -1 : 0
      )
      .map((x) => {
        return {
          dayOfWeek: x.dayOfWeek,
          times: x.times.map((xe) => {
            let startTime = xe.startTime as any as string;
            let startTimeH = Number.parseInt(startTime.split(":")[0]);
            let startTimeM = Number.parseInt(startTime.split(":")[1]);
            let endTime = xe.endTime as any;
            let endTimeH = Number.parseInt(endTime.split(":")[0]);
            let endTimeM = Number.parseInt(endTime.split(":")[1]);

            return {
              stages: xe.stages,
              startTime: (startTimeH * 60 + startTimeM) * 60 * 1000,
              _startTime: xe.startTime,
              endTime: (endTimeH * 60 + endTimeM) * 60 * 1000,
              _endTime: xe.endTime,
            } as any;
          }),
        } as LSConfig;
      });
    let currentDay: number = NOW.getDay();
    let timeNow = (NOW.getHours() * 60 + NOW.getMinutes()) * 60 * 1000;
    let timeActNow = (NOW.getHours() * 60 + NOW.getMinutes()) * 60 * 1000;
    let nextSession: any = null;
    let timeInSDaysAhead = 0;

    do {
      let times = list.schedule
        .filter((x) => x.dayOfWeek === currentDay)
        .map((x) => {
          return {
            dayOfWeek: x.dayOfWeek,
            times: x.times.filter(
              (x) => x.stages.indexOf(stage ?? list.currentStage) >= 0
            ),
          } as LSConfig;
        })
        .map((x) => {
          return {
            dayOfWeek: x.dayOfWeek,
            times: x.times
              .filter((x) => x.endTime > timeNow)
              .sort((a, b) =>
                a.startTime > b.startTime
                  ? 1
                  : a.startTime < b.startTime
                  ? -1
                  : 0
              ),
          } as LSConfig;
        });

      for (let schedule of times) {
        for (let time of schedule.times) {
          if (timeInSDaysAhead > 0) {
            const timeUntil = time.startTime - timeActNow + timeInSDaysAhead;
            console.log(
              "a",
              time,
              timeNow,
              timeActNow,
              timeInSDaysAhead,
              timeUntil
            );
            if (stage === undefined) {
              this.scheduleUpdate(time, currentDay);
            }
            return {
              timeUntil: timeUntil > 0 ? timeUntil : 0,
              startTime: (time as any)._startTime,
              endTime: (time as any)._endTime,
            };
          }

          const timeUntil = time.startTime - timeNow;
          console.log(
            "b",
            time,
            timeNow,
            timeActNow,
            timeInSDaysAhead,
            timeUntil
          );
          if (stage === undefined) {
            this.scheduleUpdate(time, currentDay);
          }
          return {
            timeUntil: timeUntil > 0 ? timeUntil : 0,
            startTime: (time as any)._startTime,
            endTime: (time as any)._endTime,
          };
        }
      }

      timeInSDaysAhead += 24 * (60 * 60 * 1000);
      currentDay++;
      timeNow = 0;
      if (currentDay > 6) currentDay = 0;
      if (currentDay === NOW.getDay()) break;
    } while (nextSession === null);

    if (stage === undefined) {
      this.states.nextSchedule = "";
    }
    return {
      timeUntil: -1,
      startTime: "00:00",
      endTime: "00:00",
    };*/
  }
}
