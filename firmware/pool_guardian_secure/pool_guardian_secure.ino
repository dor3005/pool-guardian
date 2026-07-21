#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "secrets.h"

// ---------- Pins ----------
const int LOWER_FLOAT = 27;
const int UPPER_FLOAT = 26;
const int TEMP_PIN = 25;
const int FERTILIZER_FLOAT = 33;

// ---------- Secure Edge Function ----------
const char* FUNCTION_URL =
  "https://ebmqcflmmbwnkuvdlzfp.supabase.co/functions/v1/pool-device-update";

// ---------- Temperature ----------
OneWire oneWire(TEMP_PIN);
DallasTemperature temperatureSensor(&oneWire);

// ---------- Water level ----------
enum WaterLevel {
  LEVEL_LOW,
  LEVEL_NORMAL,
  LEVEL_HIGH,
  LEVEL_ERROR
};

WaterLevel currentLevel = LEVEL_ERROR;
WaterLevel candidateLevel = LEVEL_ERROR;

unsigned long candidateSince = 0;

// ---------- Fertilizer ----------
bool currentFertilizer = false;
bool candidateFertilizer = false;

unsigned long fertilizerCandidateSince = 0;

// ---------- Timing ----------
const unsigned long STABLE_TIME = 2000;

unsigned long lastPeriodicSend = 0;
const unsigned long SEND_INTERVAL = 60000;

WaterLevel readWaterLevel() {
  int lowerState = digitalRead(LOWER_FLOAT);
  int upperState = digitalRead(UPPER_FLOAT);

  // המיפוי שבדקנו אצלך
  if (lowerState == LOW && upperState == LOW) {
    return LEVEL_LOW;
  }

  if (lowerState == HIGH && upperState == LOW) {
    return LEVEL_NORMAL;
  }

  if (lowerState == HIGH && upperState == HIGH) {
    return LEVEL_HIGH;
  }

  return LEVEL_ERROR;
}

const char* levelToText(WaterLevel level) {
  switch (level) {
    case LEVEL_LOW:
      return "Low";

    case LEVEL_NORMAL:
      return "Normal";

    case LEVEL_HIGH:
      return "High";

    default:
      return "Error";
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_NAME, WIFI_PASSWORD);

  unsigned long startedAt = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startedAt < 15000
  ) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection failed");
  }
}

float readTemperature() {
  temperatureSensor.requestTemperatures();

  float temperature =
    temperatureSensor.getTempCByIndex(0);

  if (temperature <= -126.0) {
    Serial.println("Temperature sensor error");
    return NAN;
  }

  return temperature;
}

bool sendToEdgeFunction(
  WaterLevel level,
  float temperature
) {
  connectWiFi();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot send: WiFi disconnected");
    return false;
  }

  int wifiSignal = WiFi.RSSI();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setTimeout(15000);

  if (!http.begin(client, FUNCTION_URL)) {
    Serial.println("Could not start HTTPS connection");
    return false;
  }

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  http.addHeader(
    "x-device-secret",
    DEVICE_SECRET
  );

  String json = "{\"status\":\"";
  json += levelToText(level);
  json += "\",\"temperature\":";

  if (isnan(temperature)) {
    json += "null";
  } else {
    json += String(temperature, 2);
  }

  json += ",\"fertilizer_available\":";
  json += currentFertilizer
    ? "true"
    : "false";

  json += ",\"wifi_signal\":";
  json += String(wifiSignal);

  json += "}";

  Serial.print("Sending securely: ");
  Serial.println(json);

  int responseCode = http.POST(json);

  Serial.print("Function response: ");
  Serial.println(responseCode);

  String response = http.getString();

  if (response.length() > 0) {
    Serial.println(response);
  }

  http.end();

  return responseCode >= 200 &&
         responseCode < 300;
}

void sendCurrentData() {
  float temperature = readTemperature();

  Serial.print("WATER LEVEL: ");
  Serial.println(levelToText(currentLevel));

  Serial.print("FERTILIZER: ");
  Serial.println(
    currentFertilizer
      ? "AVAILABLE"
      : "LOW"
  );

  Serial.print("TEMPERATURE: ");

  if (isnan(temperature)) {
    Serial.println("ERROR");
  } else {
    Serial.print(temperature);
    Serial.println(" C");
  }

  if (
    sendToEdgeFunction(
      currentLevel,
      temperature
    )
  ) {
    lastPeriodicSend = millis();
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(LOWER_FLOAT, INPUT_PULLUP);
  pinMode(UPPER_FLOAT, INPUT_PULLUP);
  pinMode(FERTILIZER_FLOAT, INPUT_PULLUP);

  temperatureSensor.begin();

  Serial.print("Temperature sensors found: ");
  Serial.println(
    temperatureSensor.getDeviceCount()
  );

  connectWiFi();

  candidateLevel = readWaterLevel();
  candidateSince = millis();

  candidateFertilizer =
    digitalRead(FERTILIZER_FLOAT) == HIGH;

  currentFertilizer = candidateFertilizer;
  fertilizerCandidateSince = millis();
}

void loop() {
  // ---------- Water floats ----------
  WaterLevel waterReading =
    readWaterLevel();

  if (waterReading != candidateLevel) {
    candidateLevel = waterReading;
    candidateSince = millis();
  }

  if (
    candidateLevel != currentLevel &&
    millis() - candidateSince >= STABLE_TIME
  ) {
    currentLevel = candidateLevel;
    sendCurrentData();
  }

  // ---------- Fertilizer float ----------
  bool fertilizerReading =
    digitalRead(FERTILIZER_FLOAT) == HIGH;

  if (
    fertilizerReading != candidateFertilizer
  ) {
    candidateFertilizer =
      fertilizerReading;

    fertilizerCandidateSince = millis();
  }

  if (
    candidateFertilizer != currentFertilizer &&
    millis() - fertilizerCandidateSince >=
      STABLE_TIME
  ) {
    currentFertilizer =
      candidateFertilizer;

    sendCurrentData();
  }

  // ---------- Periodic update ----------
  if (
    millis() - lastPeriodicSend >=
      SEND_INTERVAL
  ) {
    sendCurrentData();
  }

  delay(100);
}