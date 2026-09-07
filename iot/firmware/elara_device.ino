// ELARA IoT Firmware Scaffold (ESP32)
//
// STATUS: Scaffold / reference implementation, not hardware-validated.
// No prior ESP32 firmware existed in the legacy project to build on
// (see ../README.md). This demonstrates the intended request shape against
// the real backend contract in ../communication/device-protocol.md; treat
// the sensor-reading functions below as placeholders to replace with real
// driver calls (e.g. the MAX30102 Arduino library) once hardware is wired up.
//
// Required libraries (install via Arduino Library Manager):
//   - WiFi (bundled with the ESP32 board package)
//   - HTTPClient (bundled with the ESP32 board package)
//   - ArduinoJson (https://arduinojson.org/)
//
// Copy config.h.example to config.h and fill in real values before building.

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include "config.h"
#include "feature_mapping.h"

unsigned long lastIngestAttempt = 0;

void connectToWifi() {
  Serial.printf("Connecting to WiFi SSID: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.printf("WiFi connected. IP address: %s\n", WiFi.localIP().toString().c_str());
}

// Placeholder: replace with a real MAX30102 read (e.g. via SparkFun's
// MAX3010x library) that returns a validated heart-rate value, or false if
// no finger/valid signal is currently detected.
bool readHeartRate(int &bpmOut) {
  // TODO: integrate real PPG sensor driver here.
  return false;
}

// Placeholder: replace with a real BP module read, or false if no BP module
// is attached to this device.
bool readBloodPressure(int &systolicOut) {
  // TODO: integrate real BP sensor driver here, if hardware is present.
  return false;
}

// Placeholder: replace with a real glucometer module read, or false if no
// glucose module is attached to this device.
bool readFastingBloodSugarFlag(int &fbsOut) {
  // TODO: integrate real glucose sensor driver here, if hardware is present.
  return false;
}

PartialFeatureReading collectReadings() {
  PartialFeatureReading reading;

  int bpm;
  if (readHeartRate(bpm)) {
    reading.hasThalach = true;
    reading.thalach = bpm;
  }

  int systolic;
  if (readBloodPressure(systolic)) {
    reading.hasTrestbps = true;
    reading.trestbps = systolic;
  }

  int fbsFlag;
  if (readFastingBloodSugarFlag(fbsFlag)) {
    reading.hasFbs = true;
    reading.fbs = fbsFlag;
  }

  return reading;
}

// Sends only the features this device could actually populate. The backend
// will reject the request with HTTP 400 if required canonical features are
// still missing overall (age/sex/cp/exang/restecg/oldpeak/slope must come
// from the patient's manual input elsewhere in the app) -- this scaffold
// does not attempt to work around that by inventing values.
bool sendIngest(const PartialFeatureReading &reading) {
  if (!reading.hasThalach && !reading.hasTrestbps && !reading.hasFbs) {
    Serial.println("No sensor readings available this cycle; skipping ingest.");
    return false;
  }

  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/iot/ingest");
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["deviceIdentifier"] = DEVICE_IDENTIFIER;
  doc["deviceKey"] = DEVICE_KEY;

  if (reading.hasThalach) doc["thalach"] = reading.thalach;
  if (reading.hasTrestbps) doc["trestbps"] = reading.trestbps;
  if (reading.hasFbs) doc["fbs"] = reading.fbs;

  String body;
  serializeJson(doc, body);

  int statusCode = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.printf("Ingest POST status: %d\n", statusCode);
  Serial.println(response);

  return statusCode >= 200 && statusCode < 300;
}

void setup() {
  Serial.begin(115200);
  connectToWifi();
}

void loop() {
  unsigned long now = millis();

  if (now - lastIngestAttempt >= INGEST_INTERVAL_MS) {
    lastIngestAttempt = now;

    if (WiFi.status() == WL_CONNECTED) {
      PartialFeatureReading reading = collectReadings();
      sendIngest(reading);
    } else {
      Serial.println("WiFi disconnected; attempting reconnect.");
      connectToWifi();
    }
  }
}
