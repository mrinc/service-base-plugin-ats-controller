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
  private readonly loadSheddingFile: string;
  constructor(lsFile: string) {
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
    return list.currentStage;
  }
  getTimeUntilNextLoadShedding(): number {
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
    let nextSession: any = null;
    let timeInSDaysAhead = 0;

    do {
      let times = list.schedule
        .filter((x) => x.dayOfWeek === currentDay)
        .map((x) => {
          return {
            dayOfWeek: x.dayOfWeek,
            times: x.times.filter(
              (x) => x.stages.indexOf(list.currentStage) >= 0
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
          console.log(time);
          const timeUntil = time.startTime - timeNow + timeInSDaysAhead;
          return timeUntil > 0 ? timeUntil : 0;
        }
      }

      timeInSDaysAhead += 60 * 60 * 24;
      currentDay++;
      timeNow = 0;
      if (currentDay > 6) currentDay = 0;
      if (currentDay === NOW.getDay()) break;
    } while (nextSession === null);

    return -1;
  }
}
