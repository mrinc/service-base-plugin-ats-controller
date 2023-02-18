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
// sunday - 0
// monday - 1
// saturday - 6
export class loadshedding {
  private handleLog = (value: string) => {};
  private readonly loadSheddingFile: string;
  private states = {
    lastStage: -1,
    nextSchedule: "",
  };
  constructor(lsFile: string, handleLog: { (value: string): void }) {
    this.handleLog = handleLog;
    this.loadSheddingFile = lsFile;
  }
  updateStage(newStage: number) {
    if (newStage < 0 || newStage > 8) return;
    let list = JSON.parse(
      readFileSync(this.loadSheddingFile).toString()
    ) as LSDef;
    list.currentStage = newStage;
    writeFileSync(this.loadSheddingFile, JSON.stringify(list));
  }
  getStage() {
    let list = JSON.parse(
      readFileSync(this.loadSheddingFile).toString()
    ) as LSDef;
    if (this.states.lastStage !== list.currentStage) {
      this.handleLog("Load Shedding Stage: " + list.currentStage);
      this.states.lastStage = list.currentStage;
    }
    return list.currentStage;
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
  private scheduleUpdate(schedule: LSConfigTimes, currentDay: number) {
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
  }
  getTimeUntilNextLoadSheddingDetailed(stage?: number): {
    timeUntil: number;
    startTime: string;
    endTime: string;
  } {
    const NOW = new Date();
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
    };
  }
}
