// =====================================================
// X-REACH / ELARA IoT Wearable Device Firmware (ESP32)
// MAX30102 Heart Rate + Thalach (Maximum Heart Rate)
// Dual-Mode: WiFi HTTP API + USB Serial Stream (115200 baud)
//
// WiFi Configuration:
//   SSID:     Mobitel_4G_B69AC
//   Password: 242EML67850
//
// Hardware Wiring:
//   MAX30102 VIN  -> 3.3V (or 5V if using a 5V-to-3.3V breakout)
//   MAX30102 GND  -> GND
//   MAX30102 SDA  -> ESP32 GPIO 21
//   MAX30102 SCL  -> ESP32 GPIO 22
// =====================================================

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <math.h>
#include "MAX30105.h"

// =====================================================
// WIFI SETTINGS
// =====================================================
const char* WIFI_SSID     = "Mobitel_4G_B69AC";
const char* WIFI_PASSWORD = "242EML67850";

// HTTP Server on port 80
WebServer server(80);

// Sensor Object
MAX30105 particleSensor;

// Finger detection settings (Threshold requested: 80,000)
const long FINGER_THRESHOLD = 80000;
const long FINGER_HYSTERESIS = 68000;
const unsigned long FINGER_REMOVAL_DEBOUNCE_MS = 600;

// Number of BPM readings used for rolling average
const uint8_t RATE_SIZE = 8;

// Settings for Thalach (Maximum Heart Rate Achieved)
const uint8_t THALACH_REQUIRED_POINTS = 3;
const float THALACH_TOLERANCE = 8.0f; // 8 BPM tolerance window for physiological HRV
const uint8_t THALACH_HISTORY_SIZE = 10;

// =====================================================
// 32-BIT PBA BEAT DETECTION ALGORITHM (MAX30102)
// Solves SparkFun 16-bit uint16_t overflow on IR > 65,535
// =====================================================
static int32_t IR_AC_Max = 20;
static int32_t IR_AC_Min = -20;
static int32_t IR_AC_Signal_Current = 0;
static int32_t IR_AC_Signal_Previous = 0;
static int32_t IR_AC_Signal_min = 0;
static int32_t IR_AC_Signal_max = 0;
static int32_t IR_Average_Estimated = 0;
static int16_t positiveEdge = 0;
static int16_t negativeEdge = 0;
static int64_t ir_avg_reg = 0;

static int32_t cbuf[32];
static uint8_t cbuf_offset = 0;

static const uint16_t FIRCoeffs[12] = {172, 321, 579, 927, 1360, 1858, 2390, 2916, 3391, 3768, 4012, 4096};

// Average DC Estimator (Full 32-bit for IR values up to 262,143)
static inline int32_t averageDCEstimator32(int64_t *p, int32_t x)
{
    *p += ((((int64_t)x << 15) - *p) >> 4);
    return (int32_t)(*p >> 15);
}

// Low Pass FIR Filter (32-bit input and accumulator)
static inline int32_t lowPassFIRFilter32(int32_t din)
{
    cbuf[cbuf_offset] = din;

    int64_t z = (int64_t)FIRCoeffs[11] * cbuf[(cbuf_offset - 11) & 0x1F];

    for (uint8_t i = 0; i < 11; i++)
    {
        z += (int64_t)FIRCoeffs[i] * (cbuf[(cbuf_offset - i) & 0x1F] + cbuf[(cbuf_offset - 22 + i) & 0x1F]);
    }

    cbuf_offset = (cbuf_offset + 1) & 0x1F;

    return (int32_t)(z >> 15);
}

// Reset beat detector state
void resetBeatDetector()
{
    IR_AC_Max = 20;
    IR_AC_Min = -20;
    IR_AC_Signal_Current = 0;
    IR_AC_Signal_Previous = 0;
    IR_AC_Signal_min = 0;
    IR_AC_Signal_max = 0;
    IR_Average_Estimated = 0;
    positiveEdge = 0;
    negativeEdge = 0;
    ir_avg_reg = 0;
    cbuf_offset = 0;
    for (uint8_t i = 0; i < 32; i++) cbuf[i] = 0;
}

// 32-bit PBA Heart Beat Detector
bool checkForBeat32(int32_t sample)
{
    bool beatDetected = false;

    IR_AC_Signal_Previous = IR_AC_Signal_Current;

    IR_Average_Estimated = averageDCEstimator32(&ir_avg_reg, sample);
    IR_AC_Signal_Current = lowPassFIRFilter32(sample - IR_Average_Estimated);

    // Detect positive zero crossing (rising edge of pulse)
    if ((IR_AC_Signal_Previous < 0) && (IR_AC_Signal_Current >= 0))
    {
        IR_AC_Max = IR_AC_Signal_max;
        IR_AC_Min = IR_AC_Signal_min;

        positiveEdge = 1;
        negativeEdge = 0;
        IR_AC_Signal_max = 0;

        int32_t amplitude = IR_AC_Max - IR_AC_Min;
        if (amplitude > 15 && amplitude < 4000)
        {
            beatDetected = true;
        }
    }

    // Detect negative zero crossing (falling edge)
    if ((IR_AC_Signal_Previous > 0) && (IR_AC_Signal_Current <= 0))
    {
        positiveEdge = 0;
        negativeEdge = 1;
        IR_AC_Signal_min = 0;
    }

    // Find Maximum value in positive cycle
    if (positiveEdge && (IR_AC_Signal_Current > IR_AC_Signal_Previous))
    {
        IR_AC_Signal_max = IR_AC_Signal_Current;
    }

    // Find Minimum value in negative cycle
    if (negativeEdge && (IR_AC_Signal_Current < IR_AC_Signal_Previous))
    {
        IR_AC_Signal_min = IR_AC_Signal_Current;
    }

    return beatDetected;
}

// =====================================================
// BPM & THALACH VARIABLES
// =====================================================
uint8_t rates[RATE_SIZE];
uint8_t rateSpot = 0;
uint8_t validRateCount = 0;
float beatsPerMinute = 0.0;
int beatAvg = 0;
long lastBeat = 0;
long currentIrValue = 0;

float thalachHistory[THALACH_HISTORY_SIZE];
uint8_t thalachHistoryCount = 0;
uint8_t thalachHistoryIndex = 0;
float thalach = 0.0; // Confirmed Maximum Heart Rate

bool fingerPresent = false;
unsigned long fingerDropStartTime = 0;
unsigned long lastPrint = 0;
unsigned long lastWifiCheck = 0;

// =====================================================
// RESET ALL READINGS (When finger removed)
// =====================================================
void resetData()
{
    beatsPerMinute = 0.0;
    beatAvg = 0;
    lastBeat = 0;
    rateSpot = 0;
    validRateCount = 0;
    thalach = 0.0;
    thalachHistoryCount = 0;
    thalachHistoryIndex = 0;

    for (uint8_t i = 0; i < RATE_SIZE; i++) rates[i] = 0;
    for (uint8_t i = 0; i < THALACH_HISTORY_SIZE; i++) thalachHistory[i] = 0.0;

    resetBeatDetector();
}

// =====================================================
// ADD BPM TO THALACH HISTORY
// =====================================================
void addThalachReading(float bpm)
{
    thalachHistory[thalachHistoryIndex] = bpm;
    thalachHistoryIndex++;
    if (thalachHistoryIndex >= THALACH_HISTORY_SIZE) thalachHistoryIndex = 0;
    if (thalachHistoryCount < THALACH_HISTORY_SIZE) thalachHistoryCount++;
}

// =====================================================
// UPDATE THALACH (MAX HEART RATE)
// =====================================================
void updateThalach()
{
    if (thalachHistoryCount < THALACH_REQUIRED_POINTS) return;

    float highestConfirmedCluster = 0.0;

    for (uint8_t i = 0; i < thalachHistoryCount; i++)
    {
        float referenceBPM = thalachHistory[i];
        uint8_t similarCount = 0;
        float similarTotal = 0.0;

        for (uint8_t j = 0; j < thalachHistoryCount; j++)
        {
            if (fabsf(thalachHistory[j] - referenceBPM) <= THALACH_TOLERANCE)
            {
                similarCount++;
                similarTotal += thalachHistory[j];
            }
        }

        if (similarCount >= THALACH_REQUIRED_POINTS)
        {
            float confirmedValue = similarTotal / similarCount;
            if (confirmedValue > highestConfirmedCluster)
            {
                highestConfirmedCluster = confirmedValue;
            }
        }
    }

    float candidate = 0.0;
    if (highestConfirmedCluster > 0)
    {
        candidate = highestConfirmedCluster;
    }
    else if (validRateCount >= 3 && beatAvg >= 45)
    {
        candidate = (float)beatAvg;
    }

    if (candidate > 0 && candidate > thalach)
    {
        thalach = candidate;
        Serial.print(">>> THALACH CONFIRMED: ");
        Serial.print(thalach, 1);
        Serial.println(" BPM");
    }
}

// =====================================================
// HTTP REST ENDPOINTS (WIFI)
// =====================================================
void handleCors()
{
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

void handleGetData()
{
    handleCors();

    String json = "{";
    json += "\"connected\":true,";
    json += "\"fingerDetected\":" + String(fingerPresent ? "true" : "false") + ",";
    json += "\"bpm\":" + String(beatsPerMinute, 1) + ",";
    json += "\"avgBpm\":" + String(beatAvg) + ",";
    json += "\"thalach\":" + String(thalach, 1) + ",";
    json += "\"ir\":" + String(currentIrValue) + ",";
    json += "\"wifiSSID\":\"" + String(WIFI_SSID) + "\",";
    json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
    json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"uptime\":" + String(millis() / 1000);
    json += "}";

    server.send(200, "application/json", json);
}

void handleOptions()
{
    handleCors();
    server.send(204);
}

void handleRoot()
{
    handleCors();
    String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>ELARA Wearable Sensor</title>";
    html += "<style>body{font-family:sans-serif;background:#050d1b;color:#eaf3ff;text-align:center;padding:2rem;}";
    html += ".card{max-width:400px;margin:auto;background:rgba(255,255,255,0.06);border:1px solid #3fe0ff;border-radius:1rem;padding:2rem;}";
    html += ".num{font-size:3rem;font-weight:bold;color:#3fe0ff;} .label{color:#7db3ff;font-size:0.9rem;}</style></head><body>";
    html += "<div class='card'><h2>ELARA Wearable Device</h2><p class='label'>MAX30102 via WiFi (" + String(WIFI_SSID) + ")</p>";
    html += "<div class='num'>" + String(beatAvg) + "</div><div class='label'>Average Heart Rate (BPM)</div><br>";
    html += "<div class='num' style='color:#ff5c78;'>" + String(thalach, 1) + "</div><div class='label'>Thalach (Max HR) BPM</div><br>";
    html += "<p>Finger: " + String(fingerPresent ? "<span style='color:#33d9a6;'>Detected</span>" : "<span style='color:#ffb43f;'>No finger</span>") + "</p>";
    html += "<p style='font-size:0.8rem;color:#7db3ff;'>IP: " + WiFi.localIP().toString() + " | RSSI: " + String(WiFi.RSSI()) + " dBm</p>";
    html += "</div><script>setTimeout(function(){location.reload();},1500);</script></body></html>";

    server.send(200, "text/html", html);
}

// =====================================================
// SETUP
// =====================================================
void setup()
{
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("======================================");
    Serial.println(" ELARA MAX30102 HEART RATE + THALACH");
    Serial.println(" 32-bit PBA Filter | Battery Optimized");
    Serial.println(" WiFi + Serial Dual Streaming");
    Serial.println("======================================");

    // Initialize I2C for ESP32 (SDA: 21, SCL: 22)
    Wire.begin(21, 22);
    Wire.setClock(100000); // 100 kHz standard mode prevents bus hangs
    Wire.setTimeOut(100);

    // Initialize MAX30102
    if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD))
    {
        Serial.println("MAX30102 NOT FOUND! Check wiring (VIN->3.3V, GND->GND, SDA->21, SCL->22).");
        while (1)
        {
            delay(1000);
        }
    }

    Serial.println("MAX30102 sensor detected.");

    // Sensor Configuration:
    // setup(powerLevel, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange)
    // ledMode = 2 (Red + IR mode) avoids green LED power draw
    particleSensor.setup(0x3F, 4, 2, 200, 411, 4096);
    particleSensor.setPulseAmplitudeRed(0x0A);  // Dim indicator red
    particleSensor.setPulseAmplitudeGreen(0);
    particleSensor.setPulseAmplitudeIR(0x3F);   // Increased IR current (~13mA) for crisp signal on battery

    Serial.println("Sensor initialized.");

    // =================================================
    // CONNECT TO WIFI
    // =================================================
    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);                 // Disable WiFi modem sleep to eliminate CPU throttling & latency
    WiFi.setTxPower(WIFI_POWER_17dBm);    // Prevent excessive 350mA peak spikes that sag batteries
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25)
    {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.println();
        Serial.println("======================================");
        Serial.println(" >>> WIFI CONNECTED SUCCESSFULLY! <<<");
        Serial.print(" SSID:       "); Serial.println(WIFI_SSID);
        Serial.print(" IP Address: "); Serial.println(WiFi.localIP());
        Serial.print(" Signal:     "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");
        Serial.print(" Stream URL: http://"); Serial.print(WiFi.localIP()); Serial.println("/data");
        Serial.println("======================================");

        // Start mDNS responder: http://elara-wearable.local/
        if (MDNS.begin("elara-wearable"))
        {
            Serial.println("mDNS started: http://elara-wearable.local/");
        }

        // Configure Web Server routes
        server.on("/data", HTTP_GET, handleGetData);
        server.on("/data", HTTP_OPTIONS, handleOptions);
        server.on("/", HTTP_GET, handleRoot);
        server.begin();
        Serial.println("HTTP Web Server listening on port 80.");
    }
    else
    {
        Serial.println();
        Serial.println("WiFi connection attempt timed out.");
        Serial.println("ESP32 will continue operating over USB Serial and retry WiFi in background.");
    }

    Serial.println();
    Serial.println("Place your finger on the sensor to begin monitoring.");
    Serial.println();
}

// =====================================================
// MAIN LOOP
// =====================================================
void loop()
{
    yield(); // Keep FreeRTOS Task Watchdog fed

    // Handle incoming HTTP requests over WiFi
    if (WiFi.status() == WL_CONNECTED)
    {
        server.handleClient();
    }
    else
    {
        // Periodic background retry if WiFi disconnected
        if (millis() - lastWifiCheck >= 15000)
        {
            lastWifiCheck = millis();
            WiFi.reconnect();
        }
    }

    // Read IR from sensor
    long irValue = particleSensor.getIR();

    // Ignore transient 0 readings caused by I2C communication glitch / FIFO empty
    if (irValue == 0)
    {
        delay(2);
        return;
    }

    currentIrValue = irValue;

    // =================================================
    // FINGER PRESENCE DETECTION (WITH DEBOUNCE & HYSTERESIS)
    // =================================================
    if (fingerPresent)
    {
        // Finger is currently active.
        // It must drop below the hysteresis threshold (68,000) for sustained duration to trigger removal.
        if (irValue < FINGER_HYSTERESIS)
        {
            if (fingerDropStartTime == 0)
            {
                fingerDropStartTime = millis();
            }
            else if (millis() - fingerDropStartTime >= FINGER_REMOVAL_DEBOUNCE_MS)
            {
                // Sustained removal confirmed
                fingerPresent = false;
                fingerDropStartTime = 0;
                resetData();
                Serial.println("No finger | BPM: 0 | Avg BPM: 0 | Thalach: 0");
                delay(10);
                return;
            }
        }
        else
        {
            // Finger still firmly in place
            fingerDropStartTime = 0;
        }
    }
    else
    {
        // Finger is currently absent.
        // Must exceed user threshold (80,000) to activate.
        if (irValue >= FINGER_THRESHOLD)
        {
            fingerPresent = true;
            fingerDropStartTime = 0;
            resetData();

            // Pre-seed DC estimator with current reading for instantaneous convergence!
            ir_avg_reg = (int64_t)irValue << 15;
            IR_Average_Estimated = (int32_t)irValue;

            Serial.println("Finger detected. Reading heart rate...");
        }
        else
        {
            if (millis() - lastPrint >= 1000)
            {
                lastPrint = millis();
                Serial.println("No finger | BPM: 0 | Avg BPM: 0 | Thalach: 0");
            }
            delay(10);
            return;
        }
    }

    // =================================================
    // 32-BIT PBA HEARTBEAT DETECTION
    // =================================================
    if (checkForBeat32(irValue))
    {
        long currentBeat = millis();

        if (lastBeat == 0)
        {
            lastBeat = currentBeat;
        }
        else
        {
            long delta = currentBeat - lastBeat;
            lastBeat = currentBeat;

            if (delta >= 270 && delta <= 1500)
            {
                float newBPM = 60000.0 / delta;

                if (newBPM >= 45.0 && newBPM <= 200.0)
                {
                    beatsPerMinute = newBPM;

                    rates[rateSpot] = (uint8_t)newBPM;
                    rateSpot = (rateSpot + 1) % RATE_SIZE;

                    if (validRateCount < RATE_SIZE) validRateCount++;

                    int total = 0;
                    for (uint8_t i = 0; i < validRateCount; i++) total += rates[i];
                    beatAvg = total / validRateCount;

                    addThalachReading(newBPM);
                    updateThalach();

                    // Live Serial output
                    Serial.print("Beat: ");
                    Serial.print(newBPM, 1);
                    Serial.print(" BPM | Avg: ");
                    Serial.print(beatAvg);
                    Serial.print(" BPM | Thalach: ");
                    Serial.print(thalach, 1);
                    Serial.println(" BPM");
                }
            }
        }
    }

    // Serial status output every second
    if (millis() - lastPrint >= 1000)
    {
        lastPrint = millis();

        Serial.print("IR: ");
        Serial.print(irValue);
        Serial.print(" | BPM: ");
        Serial.print(beatsPerMinute, 1);
        Serial.print(" | Avg BPM: ");
        Serial.print(beatAvg);
        Serial.print(" | Thalach: ");
        Serial.print(thalach, 1);
        Serial.println(" BPM");
    }

    delay(3);
}
