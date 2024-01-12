export interface UPSInfo {
  UPS_Mode: string;
  UPS_Temp: number;
  Auto_Reboot: boolean;
  Converter_Mode: boolean;
  ECO_Mode: boolean;
  Bypass_When_UPS_Is_Off: boolean;
  Bypass_Not_Allowed: boolean;
  Fault_Type: string;
  UPS_Warning: string;
  Battery_Voltage: number;
  Battery_Capacity: number;
  Remaining_Backup_Time: number;
  Input_Frequency: number;
  Input_Voltage: number;
  Output_Frequency: number;
  Output_Voltage: number;
  Load_Level: number;
  Output_Current: number;
  // EMD_Temp?: string;
  // Alarm1?: string;
  // Humidity?: string;
  // Alarm2?: string;
  lastUpdated: number;
}
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit | undefined,
  timeout: number = 1000
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const response = await fetch(input, {
    ...init,
    signal: controller.signal,
  });
  clearTimeout(id);

  return response;
}

let lastUpdated = 0;
let cachedData: UPSInfo = {} as any;
export async function getUPSInfo(host: string): Promise<UPSInfo> {
  let lines: string[] = [];
  try {
    const response = await fetchWithTimeout(
      `${host}/cgi-bin/realInfo.cgi?sid=1.${Date.now()}`,
      {
        method: "GET",
      },
      1000
    );

    lines = (await response.text()).split("\n");
    if (lines.length < 38) throw new Error("Invalid response from UPS");
  } catch (e) {
    cachedData.lastUpdated = (Date.now() - lastUpdated) / 1000;
    return cachedData;
  }

  lastUpdated = Date.now();
  let upsInfo: any = {
    lastUpdated: 0,
    UPS_Mode: lines.splice(0, 1)[0].trim(),
    UPS_Temp: Number.parseInt(lines.splice(0, 1)[0].trim()) / 10,
    Auto_Reboot: lines.splice(0, 1)[0].trim() === "1",
    Converter_Mode: lines.splice(0, 1)[0].trim() === "1",
    ECO_Mode: lines.splice(0, 1)[0].trim() === "1",
    Bypass_When_UPS_Is_Off: lines.splice(0, 1)[0].trim() === "1",
    Bypass_Not_Allowed: lines.splice(0, 1)[0].trim() === "1",
    Fault_Type: lines.splice(0, 1)[0].trim(),
    UPS_Warning: lines.splice(0, 1)[0],
    Battery_Voltage: Number.parseInt(lines.splice(0, 1)[0].trim()) / 10,
    Battery_Capacity: Number.parseInt(lines.splice(0, 1)[0].trim()),
    Remaining_Backup_Time: Number.parseInt(lines.splice(0, 1)[0].trim()),
    Input_Frequency: Number.parseInt(lines.splice(0, 1)[0].trim()) / 10,
    Input_Voltage: Number.parseInt(lines.splice(0, 1)[0].trim()) / 10,
  };
  lines.splice(0, 1);
  upsInfo = {
    ...upsInfo,
    Output_Frequency: Number.parseInt(lines.splice(0, 1)[0].trim()) / 10,
    Output_Voltage: Number.parseInt(lines.splice(0, 1)[0].trim()) / 10,
  };
  lines.splice(0, 1);
  upsInfo = {
    ...upsInfo,
    Load_Level: Number.parseInt(lines.splice(0, 1)[0].trim()),
  };
  lines.splice(0, 17);
  upsInfo = {
    ...upsInfo,
    Output_Current: Number.parseInt(lines.splice(0, 1)[0].trim()) / 10,
    // EMD_Temp: lines[22].trim() + " ℃",
    // Alarm1: lines[23].trim(),
    // Humidity: lines[24].trim() + " %",
    // Alarm2: lines[25].trim(),
  };
  cachedData = upsInfo;
  return upsInfo;
}
