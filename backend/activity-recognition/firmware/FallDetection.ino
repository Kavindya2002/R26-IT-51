#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <DFRobot_BMI160.h>

// ================= BMI160 =================
DFRobot_BMI160 bmi160;
const int8_t i2c_addr = 0x69;
int16_t rawData[6];

// ================= LOW-PASS FILTER =================
// α = 0.1 → heavy smoothing; increase toward 0.3 for quicker response
#define ALPHA 0.1f

float fax = 0, fay = 0, faz = 0;  // filtered accel (g)
float fgx = 0, fgy = 0, fgz = 0;  // filtered gyro (deg/s)
bool filterInit = false;

// ================= CALIBRATION =================
float ax_off = 0, ay_off = 0, az_off = 0;
float gx_off = 0, gy_off = 0, gz_off = 0;
#define CAL_SAMPLES 200

// ================= MQTT =================
const char* mqtt_server = "p66a0b41.ala.dedicated.aws.emqxcloud.com";
const int   mqtt_port   = 1883;

WiFiClient espClient;
PubSubClient client(espClient);

// ================= MQTT RECONNECT =================
void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Connecting to MQTT...");
    if (client.connect("elderWearable01", "kavindya", "123456")) {
      Serial.println("connected");
    } else {
      Serial.print("failed rc=");
      Serial.print(client.state());
      Serial.println(" retry in 2s");
      delay(2000);
    }
  }
}

// ================= CALIBRATION ROUTINE =================
void calibrate() {
  Serial.println("Calibrating — keep sensor STILL for 2 seconds...");
  delay(500);

  double sax=0,say=0,saz=0,sgx=0,sgy=0,sgz=0;

  for (int i = 0; i < CAL_SAMPLES; i++) {
    bmi160.getAccelGyroData(rawData);
    sgx += rawData[0];
    sgy += rawData[1];
    sgz += rawData[2];
    sax += rawData[3];
    say += rawData[4];
    saz += rawData[5];
    delay(5);
  }

  gx_off = sgx / CAL_SAMPLES;
  gy_off = sgy / CAL_SAMPLES;
  gz_off = sgz / CAL_SAMPLES;
  ax_off = sax / CAL_SAMPLES;
  ay_off = say / CAL_SAMPLES;
  // Keep az at 1g reference: subtract bias but leave gravity in
  az_off = saz / CAL_SAMPLES - 16384.0f;

  Serial.printf("Offsets — ax:%.1f ay:%.1f az:%.1f gx:%.1f gy:%.1f gz:%.1f\n",
                ax_off, ay_off, az_off, gx_off, gy_off, gz_off);
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(D2, D1);

  Serial.println("Initializing BMI160...");
  if (bmi160.softReset() != BMI160_OK) { Serial.println("Reset failed"); while(1); }
  if (bmi160.I2cInit(i2c_addr) != BMI160_OK) { Serial.println("Init failed");  while(1); }
  Serial.println("BMI160 OK");

  calibrate();

  WiFiManager wm;
  if (!wm.autoConnect("ElderWearableSetup")) {
    Serial.println("WiFi failed — restarting");
    ESP.restart();
  }
  Serial.print("WiFi OK — IP: ");
  Serial.println(WiFi.localIP());

  client.setServer(mqtt_server, mqtt_port);
}

// ================= LOOP =================
void loop() {
  if (!client.connected()) reconnectMQTT();
  client.loop();

  bmi160.getAccelGyroData(rawData);

  // Remove offsets & scale
  float ax = (rawData[3] - ax_off) / 16384.0f;   // g
  float ay = (rawData[4] - ay_off) / 16384.0f;
  float az = (rawData[5] - az_off) / 16384.0f;
  float gx = (rawData[0] - gx_off) / 16.4f;      // deg/s  (±2000 dps range)
  float gy = (rawData[1] - gy_off) / 16.4f;
  float gz = (rawData[2] - gz_off) / 16.4f;

  // Low-pass filter — seed with first real reading
  if (!filterInit) {
    fax=ax; fay=ay; faz=az;
    fgx=gx; fgy=gy; fgz=gz;
    filterInit = true;
  } else {
    fax = ALPHA*ax + (1-ALPHA)*fax;
    fay = ALPHA*ay + (1-ALPHA)*fay;
    faz = ALPHA*az + (1-ALPHA)*faz;
    fgx = ALPHA*gx + (1-ALPHA)*fgx;
    fgy = ALPHA*gy + (1-ALPHA)*fgy;
    fgz = ALPHA*gz + (1-ALPHA)*fgz;
  }

  float mag = sqrt(fax*fax + fay*fay + faz*faz);

  // ================= JSON PAYLOAD =================
  char payload[160];
  snprintf(payload, sizeof(payload),
    "{\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,"
    "\"gx\":%.3f,\"gy\":%.3f,\"gz\":%.3f,"
    "\"mag\":%.3f}",
    fax, fay, faz, fgx, fgy, fgz, mag);

  client.publish("elder/device01/imu", payload);
  Serial.println(payload);

  delay(100);  #every 100ms, send the latest sensor data to the MQTT broker
}