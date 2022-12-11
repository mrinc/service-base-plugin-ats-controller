/*
  @mrinc 2022
*/

int channels = 8;
int cyclesMax = 10;
int cyclesDeBounce = 10;

int cycleCount = 0;
int cycleNow[] = {0,0,0,0,0,0,0,0};
int cycleMax[] = {0,0,0,0,0,0,0,0};
int cycleMin[] = {1024,1024,1024,1024,1024,1024,1024,1024};
int deviceStateKeep[] = {0,0,0,0,0,0,0,0};
int deviceState[] = {0,0,0,0,0,0,0,0};
// 0 = NO DEVICE
// 1 = DEVICE NO POWER
// 2 = DEVICE POWER

boolean canOutputStates = false;

void setup() {
  pinMode(A0, INPUT_PULLUP);
  pinMode(A1, INPUT_PULLUP);
  pinMode(A2, INPUT_PULLUP);
  pinMode(A3, INPUT_PULLUP);
  pinMode(A4, INPUT_PULLUP);
  pinMode(A5, INPUT_PULLUP);
  pinMode(A6, INPUT_PULLUP);
  pinMode(A7, INPUT_PULLUP);
  Serial.begin(115200);
}

void readChan (int chan) { 
  cycleNow[chan] = analogRead(chan);
  if (cycleNow[chan] > cycleMax[chan]) {
    cycleMax[chan] = cycleNow[chan];
  }
  if (cycleNow[chan] < cycleMin[chan]) {
    cycleMin[chan] = cycleNow[chan];
  }
}

void readData() {
  cycleCount++;
  for (int chan = 0 ; chan < channels ; chan++) {
    readChan(chan);
  }
  if (cycleCount > cyclesMax) {
    //Serial.println("[CYCLE]");
    cycleCount = 0;    
    for (int chan = 0 ; chan < channels ; chan++) {
      if (cycleMin[chan] < 1000) { 
        if (cycleMax[chan] - cycleMin[chan] < 80 || deviceStateKeep[chan] < cyclesDeBounce) {
          deviceState[chan] = 1;
          deviceStateKeep[chan]++;
        } else {
          deviceState[chan] = 2;
          deviceStateKeep[chan] = cyclesDeBounce;
          canOutputStates = true;
        }
      } else {        
        deviceState[chan] = 0;
        deviceStateKeep[chan] = 0;
      }
      if (deviceStateKeep[chan] > cyclesDeBounce) {
        deviceStateKeep[chan] = 0;
      }
      cycleNow[chan] = 0;
      cycleMax[chan] = 0;
      cycleMin[chan] = 1024;
    }
  }
}

void serialOutValues() {
  Serial.print("[VALUE:");
  for (int chan = 0 ; chan < channels ; chan++) {
    Serial.print(cycleNow[chan]);
    if (chan < channels-1) {Serial.print(':');}
  }
  Serial.println("]");  
}

void serialOutMinMax() {
  Serial.print("[MINMAX:");
  for (int chan = 0 ; chan < channels ; chan++) {
    Serial.print(cycleMin[chan]);
    Serial.print('-');
    Serial.print(cycleMax[chan]);
    if (chan < channels-1) {Serial.print(':');}
  }
  Serial.println("]");  
}

int deviceStateLast[] = {-1,-1,-1,-1,-1,-1,-1,-1};
void serialOutStates(boolean force = false) {
  if (!force) {
    boolean sendOut = false;
    for (int chan = 0 ; chan < channels ; chan++) {
      if (deviceStateLast[chan] != deviceState[chan]) {
        sendOut = true;
      }
      deviceStateLast[chan] = deviceState[chan];
    }
    if (!sendOut) return;
  }
  
  Serial.print("[STATE:");
  for (int chan = 0 ; chan < channels ; chan++) {
    Serial.print(deviceState[chan]);
    if (chan < channels-1) {Serial.print(':');}
  }
  Serial.println("]");  
}

int pingCount = 0;
void runPing() {
  pingCount++;
  if (pingCount < 1000) { return; } 
  pingCount = 0;
  Serial.println("[PING]");
  //delay(10);
  serialOutStates(true);
}

void loop() {
  readData();
  //serialOutValues();
  //serialOutMinMax();
  if (canOutputStates) {
    serialOutStates();
  }
  runPing();
  delay(10);
}
