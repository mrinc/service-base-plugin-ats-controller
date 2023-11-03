import { readFileSync, writeFileSync } from "fs";

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
  end: Date;//string;
  note: string;
  start: Date;//string;
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

// sunday - 0
// monday - 1
// saturday - 6
export class loadshedding {
  private ESPLSStatus: ESPAreaStatus | null = null;
  private handleLog = (value: string) => {};
  /*private readonly loadSheddingFile: string;
  private states = {
    lastStage: -1,
    nextSchedule: "",
  };*/

  private ESPAPIKey: string;
  private LoadSheddingESPID: string;
  private ESPRequestsPerDay = 50;

  private triggerESPUpdate() {
    let myHeaders = new Headers();
    myHeaders.append("token", this.ESPAPIKey);

    let requestOptions = {
      method: "GET",
      headers: myHeaders,
      redirect: "follow",
    };

    fetch(
      "https://developer.sepush.co.za/business/2.0/area?id=" +
        this.LoadSheddingESPID,
      requestOptions as any
    )
      .then((response) => response.json())
      .then((result) => {
        for (let index = 0 ; index < result.events.length; index++) {
          result.events[index].start = new Date(result.events[index].start);
          result.events[index].end = new Date(result.events[index].end);
        }
        this.ESPLSStatus = result as ESPAreaStatus;
      })
      .catch((error) => {
        this.handleLog("Error getting load shedding status: " + error);
        this.ESPLSStatus = null;
      });
  }
  private scheduleUpdateInterval: NodeJS.Timeout | null = null;
  constructor(/*lsFile: string, */handleLog: { (value: string): void }, ESPAPIKey: string, LoadSheddingESPID: string, ESPRequestsPerDay: number) {
    this.ESPAPIKey = ESPAPIKey;
    this.LoadSheddingESPID = LoadSheddingESPID;
    this.ESPRequestsPerDay = ESPRequestsPerDay;
    this.handleLog = handleLog;
    //this.loadSheddingFile = lsFile;
    // Calculate the total milliseconds in a day
    const totalMillisecondsInADay = 24 * 60 * 60 * 1000;
    // Calculate the interval between each request
    const intervalBetweenEachRequest =
      totalMillisecondsInADay / (this.ESPRequestsPerDay-2);
    this.scheduleUpdateInterval = setInterval(() => {
      this.triggerESPUpdate();
    }, Math.round(intervalBetweenEachRequest));
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
  getStage() {
    if (this.ESPLSStatus === null) return 0;
    let stage = 0;
    for (let lsevent of this.ESPLSStatus.events) {
      if (new Date() >= lsevent.start && new Date() <= lsevent.end) {
        stage = Number.parseInt(lsevent.note.split(" ")[1]);
      }
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
  getTimeUntilNextLoadSheddingDetailed(stage?: number): {
    timeUntil: number;
    startTime: string;
    endTime: string;
  } {
    if (this.ESPLSStatus === null) return { timeUntil: -1, startTime: "00:00", endTime: "00:00" };
    let activeStage = stage ?? this.getStage();
    if (activeStage === 0) return { timeUntil: -1, startTime: "00:00", endTime: "00:00" };
    
    let scheds = this.ESPLSStatus.schedule.days[0].stages[activeStage-1];
    if (scheds.length === 0) return { timeUntil: -1, startTime: "00:00", endTime: "00:00" };
    for (let sched of scheds) {
      let startTime = sched.split("-")[0];
      let endTime = sched.split("-")[1];
      let startTimeH = Number.parseInt(startTime.split(":")[0]);
      let startTimeM = Number.parseInt(startTime.split(":")[1]);
      let endTimeH = Number.parseInt(endTime.split(":")[0]);
      let endTimeM = Number.parseInt(endTime.split(":")[1]);
      let timeNow = new Date();
      let startTimeDate = new Date();
      startTimeDate.setHours(startTimeH);
      startTimeDate.setMinutes(startTimeM);
      startTimeDate.setSeconds(0);
      startTimeDate.setMilliseconds(0);
      let endTimeDate = new Date();
      endTimeDate.setHours(endTimeH);
      endTimeDate.setMinutes(endTimeM);
      endTimeDate.setSeconds(0);
      endTimeDate.setMilliseconds(0);
      if (timeNow >= startTimeDate && timeNow <= endTimeDate) {
        return {
          timeUntil: -1,
          startTime,
          endTime,
        };
      }
      if (timeNow < startTimeDate) {
        return {
          timeUntil: startTimeDate.getTime() - timeNow.getTime(),
          startTime,
          endTime,
        };
      }
    }
    return { timeUntil: -1, startTime: "00:00", endTime: "00:00" };

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
