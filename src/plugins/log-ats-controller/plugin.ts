import {
  Logger as BaseLogger,
  LogLevels,
} from "@bettercorp/service-base/lib/plugins/log-default/plugin";
import { PluginConfig } from "./sec.config";
import { IPluginLogger, LogMeta, LoggerBase } from "@bettercorp/service-base";
import { WriteStream, createWriteStream, existsSync, renameSync } from "fs";
import { Tools } from "@bettercorp/tools";
import { join } from "path";

export class Logger extends LoggerBase<PluginConfig> {
  private baseLogger: BaseLogger;
  private logStream: WriteStream | null = null;
  private logTimeout: NodeJS.Timeout | undefined = undefined;
  private firstLog: boolean = true;
  private logLinesWritten: number = 0;
  private async logTimeoutHandler() {
    if (!Tools.isNullOrUndefined(this.logStream)) {
      this.logStream.close();
      this.logStream = null;
    }
    this.logTimeout = undefined;
  }
  private async revolveLog() {
    const logFile = await (await this.getPluginConfig()).logFile!;
    const logFilePath = join(this.cwd, logFile);
    if (existsSync(logFilePath)) {
      let counter = 0;
      let tLogfilePath = `${logFilePath}.0`;
      while (existsSync(tLogfilePath)) {
        tLogfilePath = `${join(this.cwd, logFile)}.${counter}`;
        counter++;
      }
      renameSync(logFilePath, tLogfilePath);
      this.logLinesWritten = 0;
      this.firstLog = false;
    }
  }
  private async writeLogLine(log: string): Promise<boolean> {
    this.logLinesWritten++;
    this.logStream!.write(new Date().toISOString());
    this.logStream!.write(": ");
    this.logStream!.write(log);
    this.logStream!.write("\n");

    if (this.logLinesWritten > 100000) {
      clearTimeout(this.logTimeout);
      await this.logTimeoutHandler();
      await this.revolveLog();
      return true;
    }
    return false;
  }
  private async writeLog(log: string) {
    if (!Tools.isNullOrUndefined(this.logStream)) {
      if (await this.writeLogLine(log)) return;
      clearTimeout(this.logTimeout);
      this.logTimeout = setTimeout(this.logTimeoutHandler.bind(this), 10000);
      return;
    }
    const logFile = await (await this.getPluginConfig()).logFile!;
    const logFilePath = join(this.cwd, logFile);

    if (this.firstLog) {
      await this.revolveLog();
    }
    this.logStream = createWriteStream(logFilePath, { encoding: "utf8" });
    if (await this.writeLogLine(log)) return;
    this.logTimeout = setTimeout(this.logTimeoutHandler.bind(this), 10000);
  }

  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    defaultLogger: IPluginLogger,
    mockConsole?: { (level: number, message: string): void }
  ) {
    super(pluginName, cwd, pluginCwd, defaultLogger);
    this.baseLogger = new BaseLogger(pluginName, cwd, pluginCwd, defaultLogger);
  }

  private logEvent<T extends string>(
    level: LogLevels,
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ) {
    let formattedMessage = this.formatLog<T>(message, meta);
    formattedMessage = `[${plugin.toUpperCase()}] ${formattedMessage}`;
    if (level === LogLevels.STAT) {
      formattedMessage = `[STAT] ${formattedMessage}`;
    }
    if (level === LogLevels.TSTAT) {
      formattedMessage = `[STAT] ${formattedMessage}`;
    }
    if (level === LogLevels.DEBUG) {
      return;
      //formattedMessage = `[DEBUG] ${formattedMessage}`;
    }
    if (level === LogLevels.INFO) {
      formattedMessage = `[INFO] ${formattedMessage}`;
    }
    if (level === LogLevels.WARN) {
      formattedMessage = `[WARN] ${formattedMessage}`;
    }
    if (level === LogLevels.ERROR) {
      formattedMessage = `[ERROR] ${formattedMessage}`;
    }
    this.writeLog(formattedMessage);
  }

  public async reportStat(
    plugin: string,
    key: string,
    value: number
  ): Promise<void> {
    await this.baseLogger.reportStat(plugin, key, value);
    if (!this.runningDebug) return;
    this.logEvent(LogLevels.STAT, plugin, "[{key}={value}]", { key, value });
  }
  public async reportTextStat<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    await this.baseLogger.reportTextStat(plugin, message, meta, hasPIData);
    if (!this.runningDebug) return;
    this.logEvent<T>(LogLevels.TSTAT, plugin, message as T, meta);
  }
  public async debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    await this.baseLogger.debug(plugin, message, meta, hasPIData);
    if (!this.runningDebug) return;
    this.logEvent<T>(LogLevels.DEBUG, plugin, message as T, meta);
  }
  public async info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    await this.baseLogger.info(plugin, message, meta, hasPIData);
    if (this.runningLive && hasPIData === true) return;
    this.logEvent<T>(LogLevels.INFO, plugin, message as T, meta);
  }
  public async warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    await this.baseLogger.warn(plugin, message, meta, hasPIData);
    if (this.runningLive && hasPIData === true) return;
    this.logEvent<T>(LogLevels.WARN, plugin, message as T, meta);
  }
  public async error<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  public async error(plugin: string, error: Error): Promise<void>;
  public async error<T extends string>(
    plugin: string,
    messageOrError: T | Error,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    await this.baseLogger.error(plugin, messageOrError as any, meta, hasPIData);
    let message =
      typeof messageOrError === "string"
        ? messageOrError
        : messageOrError.message;
    if (this.runningLive && hasPIData === true) return;
    this.logEvent<T>(LogLevels.ERROR, plugin, message as T, meta);
    if (
      typeof messageOrError !== "string" &&
      messageOrError.stack !== undefined
    ) {
      console.error(messageOrError.stack.toString());
    }
  }
}
