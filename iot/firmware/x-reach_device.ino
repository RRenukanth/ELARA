// Arduino prototype-generation compatibility declarations
struct FeatureRange;
struct MappingResult;

/*
================================================================================
 ELARA UNIFIED WEARABLE FIRMWARE (ESP32)
 Concurrent MAX30102 Optical PPG + AD8232 Bio-potential ECG Pipeline
 Dual-Mode: WiFi REST API + USB Serial Stream (115200 baud)
================================================================================

 Hardware Wiring:
   [MAX30102 PPG Sensor]
     VIN  -> 3.3V
     GND  -> GND
     SDA  -> ESP32 GPIO 21
     SCL  -> ESP32 GPIO 22

   [AD8232 ECG Sensor]
     3.3V -> 3.3V
     GND  -> GND
     OUTPUT -> ESP32 GPIO 34 (ADC1 CH6 - safe with WiFi)
     LO+  -> ESP32 GPIO 25
     LO-  -> ESP32 GPIO 26

 WiFi Configuration:
   SSID:     Mobitel_4G_B69AC
   Password: 242EML67850
================================================================================
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <math.h>
#include "MAX30105.h"

// ============================================================================
// TYPE DEFINITIONS FOR CLEVELAND DOMAIN MAPPING
// ============================================================================
struct FeatureRange
{
    float minimum;
    float maximum;
};

FeatureRange ageRange       = {29.0f, 77.0f};
FeatureRange trestbpsRange  = {94.0f, 200.0f};
FeatureRange thalachRange   = {71.0f, 202.0f};
FeatureRange oldpeakRange   = {0.0f, 6.2f};

struct MappingResult
{
    float age;
    float trestbps;
    float thalach;
    float oldpeak;

    int sex;
    int cp;
    int fbs;
    int restecg;
    int exang;
    int slope;

    float mappingConfidence;

    bool ageOutOfRange;
    bool trestbpsOutOfRange;
    bool thalachOutOfRange;
    bool oldpeakOutOfRange;

    bool outOfDistribution;
};

struct RLState
{
    float age;
    float sex;
    float cp;
    float trestbps;
    float fbs;
    float restecg;
    float thalach;
    float exang;
    float oldpeak;
    float slope;
};

// ============================================================================
// WIFI & SERVER SETTINGS
// ============================================================================
const char* WIFI_SSID     = "Mobitel_4G_B69AC";
const char* WIFI_PASSWORD = "242EML67850";

WebServer server(80);

// ============================================================================
// SENSOR 1: MAX30102 PPG CONFIGURATION
// ============================================================================
MAX30105 particleSensor;

const long FINGER_THRESHOLD = 80000;
const long FINGER_HYSTERESIS = 68000;
const unsigned long FINGER_REMOVAL_DEBOUNCE_MS = 600;

const uint8_t RATE_SIZE = 8;
const uint8_t THALACH_REQUIRED_POINTS = 3;
const float THALACH_TOLERANCE = 8.0f;
const uint8_t THALACH_HISTORY_SIZE = 10;

// 32-bit PBA Beat Detector State for MAX30102
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

static inline int32_t averageDCEstimator32(int64_t *p, int32_t x)
{
    *p += ((((int64_t)x << 15) - *p) >> 4);
    return (int32_t)(*p >> 15);
}

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

bool checkForBeat32(int32_t sample)
{
    bool beatDetected = false;
    IR_AC_Signal_Previous = IR_AC_Signal_Current;

    IR_Average_Estimated = averageDCEstimator32(&ir_avg_reg, sample);
    IR_AC_Signal_Current = lowPassFIRFilter32(sample - IR_Average_Estimated);

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

    if ((IR_AC_Signal_Previous > 0) && (IR_AC_Signal_Current <= 0))
    {
        positiveEdge = 0;
        negativeEdge = 1;
        IR_AC_Signal_min = 0;
    }

    if (positiveEdge && (IR_AC_Signal_Current > IR_AC_Signal_Previous))
    {
        IR_AC_Signal_max = IR_AC_Signal_Current;
    }

    if (negativeEdge && (IR_AC_Signal_Current < IR_AC_Signal_Previous))
    {
        IR_AC_Signal_min = IR_AC_Signal_Current;
    }

    return beatDetected;
}

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
float thalach = 0.0;

bool fingerPresent = false;
unsigned long fingerDropStartTime = 0;

void resetPpgData()
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

void addThalachReading(float bpm)
{
    thalachHistory[thalachHistoryIndex] = bpm;
    thalachHistoryIndex = (thalachHistoryIndex + 1) % THALACH_HISTORY_SIZE;
    if (thalachHistoryCount < THALACH_HISTORY_SIZE) thalachHistoryCount++;
}

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
    if (highestConfirmedCluster > 0) candidate = highestConfirmedCluster;
    else if (validRateCount >= 3 && beatAvg >= 45) candidate = (float)beatAvg;

    if (candidate > 0 && candidate > thalach)
    {
        thalach = candidate;
        Serial.print(">>> PPG THALACH CONFIRMED: ");
        Serial.print(thalach, 1);
        Serial.println(" BPM");
    }
}

// ============================================================================
// SENSOR 2: AD8232 ECG CONFIGURATION & DIGITAL FILTERS
// ============================================================================
#define ECG_PIN       34
#define LO_PLUS_PIN   25
#define LO_MINUS_PIN  26

#define ADC_RESOLUTION 12
#define ADC_MAX_VALUE  4095

const float ECG_SAMPLE_RATE = 500.0f;
const unsigned long ECG_SAMPLE_INTERVAL_US = 2000; // 500 Hz

const int ECG_BUFFER_SIZE = 1000;
const int DASHBOARD_BUFFER_SIZE = 300;

float ecgBuffer[ECG_BUFFER_SIZE];
float qrsBuffer[ECG_BUFFER_SIZE];
int ecgWriteIndex = 0;
bool ecgBufferFull = false;

float dashboardBuffer[DASHBOARD_BUFFER_SIZE];
int dashboardWriteIndex = 0;

class Biquad
{
public:
    float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
    float x1 = 0.0f, x2 = 0.0f, y1 = 0.0f, y2 = 0.0f;

    void reset() { x1 = x2 = y1 = y2 = 0; }

    float process(float x)
    {
        float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x;
        y2 = y1; y1 = y;
        return y;
    }
};

Biquad morphHP, morphLP, notch50, qrsHP, qrsLP;

void setupHighPass(Biquad &f, float frequency, float Q)
{
    float w0 = 2.0f * PI * frequency / ECG_SAMPLE_RATE;
    float alpha = sin(w0) / (2.0f * Q);
    float cosw = cos(w0);
    float b0 = (1.0f + cosw) / 2.0f;
    float b1 = -(1.0f + cosw);
    float b2 = (1.0f + cosw) / 2.0f;
    float a0 = 1.0f + alpha;
    float a1 = -2.0f * cosw;
    float a2 = 1.0f - alpha;
    f.b0 = b0 / a0; f.b1 = b1 / a0; f.b2 = b2 / a0; f.a1 = a1 / a0; f.a2 = a2 / a0;
    f.reset();
}

void setupLowPass(Biquad &f, float frequency, float Q)
{
    float w0 = 2.0f * PI * frequency / ECG_SAMPLE_RATE;
    float alpha = sin(w0) / (2.0f * Q);
    float cosw = cos(w0);
    float b0 = (1.0f - cosw) / 2.0f;
    float b1 = 1.0f - cosw;
    float b2 = (1.0f - cosw) / 2.0f;
    float a0 = 1.0f + alpha;
    float a1 = -2.0f * cosw;
    float a2 = 1.0f - alpha;
    f.b0 = b0 / a0; f.b1 = b1 / a0; f.b2 = b2 / a0; f.a1 = a1 / a0; f.a2 = a2 / a0;
    f.reset();
}

void setupNotch(Biquad &f, float frequency, float Q)
{
    float w0 = 2.0f * PI * frequency / ECG_SAMPLE_RATE;
    float alpha = sin(w0) / (2.0f * Q);
    float cosw = cos(w0);
    float b0 = 1.0f;
    float b1 = -2.0f * cosw;
    float b2 = 1.0f;
    float a0 = 1.0f + alpha;
    float a1 = -2.0f * cosw;
    float a2 = 1.0f - alpha;
    f.b0 = b0 / a0; f.b1 = b1 / a0; f.b2 = b2 / a0; f.a1 = a1 / a0; f.a2 = a2 / a0;
    f.reset();
}

void setupEcgFilters()
{
    setupHighPass(morphHP, 0.05f, 0.707f);
    setupLowPass(morphLP, 100.0f, 0.707f);
    setupNotch(notch50, 50.0f, 20.0f);
    setupHighPass(qrsHP, 5.0f, 0.707f);
    setupLowPass(qrsLP, 20.0f, 0.707f);
}

// Patient parameters
int patientAge = 25;
int patientSex = 1;
int patientCP = 3;
int patientFBS = 0;
int patientExang = 0;
float patientTrestbps = 120.0f;

// ECG Landmark and analysis variables
float latestFilteredECG = 0.0f;
float latestQRS = 0.0f;
int latestRIndex = -1;
float P_amplitude = NAN, Q_amplitude = NAN, R_amplitude = NAN;
float S_amplitude = NAN, T_amplitude = NAN, J_amplitude = NAN;

float ecgHeartRate = 0.0f;
float stDeviation = 0.0f;
float oldpeakEstimate = 0.0f;
float stSlope = 0.0f;
float signalQuality = 0.0f;
int restECG = 0;
int slopeCategory = 2; // 1: upsloping, 2: flat, 3: downsloping
RLState rlState;

float chronologicalECG[ECG_BUFFER_SIZE];
float chronologicalQRS[ECG_BUFFER_SIZE];
int chronologicalCount = 0;

void constructChronologicalSignal()
{
    chronologicalCount = ecgBufferFull ? ECG_BUFFER_SIZE : ecgWriteIndex;
    if (chronologicalCount <= 0) return;
    int startIndex = ecgBufferFull ? ecgWriteIndex : 0;
    for (int i = 0; i < chronologicalCount; i++)
    {
        int index = (startIndex + i) % ECG_BUFFER_SIZE;
        chronologicalECG[i] = ecgBuffer[index];
        chronologicalQRS[i] = qrsBuffer[index];
    }
}

float calculateMean(float *data, int start, int end)
{
    if (end <= start) return 0.0f;
    float sum = 0.0f;
    for (int i = start; i < end; i++) sum += data[i];
    return sum / (float)(end - start);
}

float calculateStd(float *data, int start, int end)
{
    if (end <= start) return 0.0f;
    float mean = calculateMean(data, start, end);
    float sum = 0.0f;
    for (int i = start; i < end; i++)
    {
        float d = data[i] - mean;
        sum += d * d;
    }
    return sqrt(sum / (float)(end - start));
}

int findMaximum(float *data, int start, int end)
{
    if (end <= start) return -1;
    int index = start;
    float value = data[start];
    for (int i = start + 1; i < end; i++)
    {
        if (data[i] > value) { value = data[i]; index = i; }
    }
    return index;
}

int findMinimum(float *data, int start, int end)
{
    if (end <= start) return -1;
    int index = start;
    float value = data[start];
    for (int i = start + 1; i < end; i++)
    {
        if (data[i] < value) { value = data[i]; index = i; }
    }
    return index;
}

int detectLatestRPeak()
{
    if (chronologicalCount < 400) return -1;
    int start = 100, end = chronologicalCount - 100;
    if (end <= start) return -1;

    float mean = calculateMean(chronologicalQRS, start, end);
    float std = calculateStd(chronologicalQRS, start, end);
    float threshold = mean + 0.65f * std;

    const int refractorySamples = 100;
    int lastPeak = -1000;
    int latestPeak = -1;

    for (int i = start + 2; i < end - 2; i++)
    {
        bool localMaximum =
            chronologicalQRS[i] > chronologicalQRS[i - 1] &&
            chronologicalQRS[i] >= chronologicalQRS[i + 1];

        if (!localMaximum || chronologicalQRS[i] < threshold) continue;

        if ((i - lastPeak) < refractorySamples)
        {
            if (latestPeak >= 0 && chronologicalQRS[i] > chronologicalQRS[latestPeak])
            {
                latestPeak = i; lastPeak = i;
            }
            continue;
        }
        latestPeak = i; lastPeak = i;
    }
    return latestPeak;
}

float calculateHeartRateFromPeaks()
{
    if (chronologicalCount < 500) return 0.0f;
    float mean = calculateMean(chronologicalQRS, 100, chronologicalCount - 100);
    float std = calculateStd(chronologicalQRS, 100, chronologicalCount - 100);
    float threshold = mean + 0.65f * std;

    const int refractory = 100;
    int previousPeak = -1000, peakCount = 0;
    int intervals[8];

    for (int i = 102; i < chronologicalCount - 102; i++)
    {
        bool localMaximum =
            chronologicalQRS[i] > chronologicalQRS[i - 1] &&
            chronologicalQRS[i] >= chronologicalQRS[i + 1];

        if (!localMaximum || chronologicalQRS[i] < threshold) continue;
        if ((i - previousPeak) < refractory) continue;

        if (previousPeak >= 0)
        {
            int interval = i - previousPeak;
            if (interval >= 250 && interval <= 1000 && peakCount < 8)
            {
                intervals[peakCount++] = interval;
            }
        }
        previousPeak = i;
    }

    if (peakCount == 0) return 0.0f;
    float sum = 0.0f;
    for (int i = 0; i < peakCount; i++) sum += intervals[i];
    float rrSeconds = (sum / (float)peakCount) / ECG_SAMPLE_RATE;
    return (rrSeconds > 0) ? (60.0f / rrSeconds) : 0.0f;
}

float mapContinuousToCleveland(float value, FeatureRange range, bool &outOfRange)
{
    outOfRange = false;
    if (value < range.minimum) { outOfRange = true; return range.minimum; }
    if (value > range.maximum) { outOfRange = true; return range.maximum; }
    return value;
}

int mapRestECG(float stDev, float tAmp, float sigQ)
{
    if (sigQ < 0.40f) return 0;
    if (fabs(stDev) > 0.15f) return 1;
    return 0;
}

int mapSlope(float sSlope)
{
    if (sSlope > 0.002f) return 1;  // upsloping
    if (sSlope < -0.002f) return 3; // downsloping
    return 2;                       // flat
}

float mapOldpeak(float rawOldpeak, bool &outOfRange)
{
    return mapContinuousToCleveland(rawOldpeak, oldpeakRange, outOfRange);
}

void analyzeLatestBeat()
{
    latestRIndex = detectLatestRPeak();
    if (latestRIndex < 0) return;

    int pStart = latestRIndex - (int)(0.20f * ECG_SAMPLE_RATE);
    int pEnd   = latestRIndex - (int)(0.08f * ECG_SAMPLE_RATE);
    int qStart = latestRIndex - (int)(0.06f * ECG_SAMPLE_RATE);
    int qEnd   = latestRIndex - (int)(0.01f * ECG_SAMPLE_RATE);
    int sStart = latestRIndex + (int)(0.01f * ECG_SAMPLE_RATE);
    int sEnd   = latestRIndex + (int)(0.08f * ECG_SAMPLE_RATE);
    int tStart = latestRIndex + (int)(0.10f * ECG_SAMPLE_RATE);
    int tEnd   = latestRIndex + (int)(0.40f * ECG_SAMPLE_RATE);

    if (pStart < 0) pStart = 0;
    if (pEnd > chronologicalCount) pEnd = chronologicalCount;
    if (qStart < 0) qStart = 0;
    if (qEnd > chronologicalCount) qEnd = chronologicalCount;
    if (sStart < 0) sStart = 0;
    if (sEnd > chronologicalCount) sEnd = chronologicalCount;
    if (tStart < 0) tStart = 0;
    if (tEnd > chronologicalCount) tEnd = chronologicalCount;

    int pIndex = findMaximum(chronologicalECG, pStart, pEnd);
    int qIndex = findMinimum(chronologicalECG, qStart, qEnd);
    int sIndex = findMinimum(chronologicalECG, sStart, sEnd);
    int tIndex = findMaximum(chronologicalECG, tStart, tEnd);

    if (pIndex >= 0) P_amplitude = chronologicalECG[pIndex];
    if (qIndex >= 0) Q_amplitude = chronologicalECG[qIndex];
    R_amplitude = chronologicalECG[latestRIndex];
    if (sIndex >= 0) S_amplitude = chronologicalECG[sIndex];
    if (tIndex >= 0) T_amplitude = chronologicalECG[tIndex];

    int jIndex = latestRIndex + (int)(0.06f * ECG_SAMPLE_RATE);
    if (jIndex >= 0 && jIndex < chronologicalCount) J_amplitude = chronologicalECG[jIndex];

    int baselineStart = latestRIndex - (int)(0.20f * ECG_SAMPLE_RATE);
    int baselineEnd   = latestRIndex - (int)(0.12f * ECG_SAMPLE_RATE);
    if (baselineStart < 0) baselineStart = 0;
    if (baselineEnd > chronologicalCount) baselineEnd = chronologicalCount;
    float baseline = calculateMean(chronologicalECG, baselineStart, baselineEnd);

    if (jIndex >= 0 && jIndex < chronologicalCount)
    {
        stDeviation = chronologicalECG[jIndex] - baseline;
    }

    int st1Index = latestRIndex + (int)(0.06f * ECG_SAMPLE_RATE);
    int st2Index = latestRIndex + (int)(0.12f * ECG_SAMPLE_RATE);
    if (st1Index >= 0 && st2Index < chronologicalCount)
    {
        stSlope = (chronologicalECG[st2Index] - chronologicalECG[st1Index]) / 0.06f;
    }

    oldpeakEstimate = fabs(stDeviation) / 1000.0f;
    restECG = mapRestECG(stDeviation, T_amplitude, signalQuality);
    slopeCategory = mapSlope(stSlope);
}

float calculateSignalQuality()
{
    if (chronologicalCount < 250) return 0.0f;
    int start = chronologicalCount - 250;
    float std = calculateStd(chronologicalECG, start, chronologicalCount);
    if (std < 1.0f) return 0.20f;
    if (std > 2000.0f) return 0.30f;
    if (std > 1000.0f) return 0.55f;
    if (std > 500.0f) return 0.75f;
    return 0.90f;
}

MappingResult buildClevelandMappedState(
    float rawHeartRate,
    float rawOldpeak,
    float rawSTSlope,
    float rawSTDeviation,
    float rawTAmplitude,
    float sigQual
)
{
    MappingResult result;
    result.age = mapContinuousToCleveland((float)patientAge, ageRange, result.ageOutOfRange);
    result.trestbps = mapContinuousToCleveland(patientTrestbps, trestbpsRange, result.trestbpsOutOfRange);
    result.thalach = mapContinuousToCleveland(rawHeartRate, thalachRange, result.thalachOutOfRange);
    result.oldpeak = mapOldpeak(rawOldpeak, result.oldpeakOutOfRange);

    result.sex = constrain(patientSex, 0, 1);
    result.cp = constrain(patientCP, 0, 3);
    result.fbs = constrain(patientFBS, 0, 1);
    result.exang = constrain(patientExang, 0, 1);

    result.restecg = mapRestECG(rawSTDeviation, rawTAmplitude, sigQual);
    result.slope = mapSlope(rawSTSlope);

    result.outOfDistribution =
        result.ageOutOfRange ||
        result.trestbpsOutOfRange ||
        result.thalachOutOfRange ||
        result.oldpeakOutOfRange;

    float confidence = 1.0f;
    if (result.ageOutOfRange) confidence -= 0.15f;
    if (result.trestbpsOutOfRange) confidence -= 0.20f;
    if (result.thalachOutOfRange) confidence -= 0.25f;
    if (result.oldpeakOutOfRange) confidence -= 0.20f;
    if (sigQual < 0.60f) confidence -= 0.20f;

    result.mappingConfidence = constrain(confidence, 0.0f, 1.0f);
    return result;
}

void constructRLState(const MappingResult &mapped)
{
    rlState.age      = mapped.age;
    rlState.sex      = mapped.sex;
    rlState.cp       = mapped.cp;
    rlState.trestbps = mapped.trestbps;
    rlState.fbs      = mapped.fbs;
    rlState.restecg  = mapped.restecg;
    rlState.thalach  = mapped.thalach;
    rlState.exang    = mapped.exang;
    rlState.oldpeak  = mapped.oldpeak;
    rlState.slope    = mapped.slope;
}

// ============================================================================
// REST API & CORS
// ============================================================================
void handleCors()
{
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

void handleOptions()
{
    handleCors();
    server.send(204);
}

String jsonFloat(float value, int decimals = 3)
{
    if (isnan(value) || isinf(value)) return "0";
    return String(value, decimals);
}

// Endpoint 1: MAX30102 PPG Heart Rate + Thalach
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

// Endpoint 2: AD8232 ECG Waveform & Cleveland Features
void handleECG()
{
    handleCors();

    constructChronologicalSignal();
    signalQuality = calculateSignalQuality();
    ecgHeartRate = calculateHeartRateFromPeaks();
    analyzeLatestBeat();

    // Use PPG thalach if available, else ECG heart rate
    float effectiveThalach = (thalach > 0) ? thalach : ecgHeartRate;

    MappingResult mapped = buildClevelandMappedState(
        effectiveThalach,
        oldpeakEstimate,
        stSlope,
        stDeviation,
        T_amplitude,
        signalQuality
    );
    constructRLState(mapped);

    String json = "{";
    json += "\"samples\":[";

    int sendCount = min(chronologicalCount, DASHBOARD_BUFFER_SIZE);
    int start = chronologicalCount - sendCount;
    for (int i = start; i < chronologicalCount; i++)
    {
        json += jsonFloat(chronologicalECG[i], 2);
        if (i < chronologicalCount - 1) json += ",";
    }
    json += "],";

    bool leadsOff = digitalRead(LO_PLUS_PIN) || digitalRead(LO_MINUS_PIN);
    json += "\"leadsOff\":" + String(leadsOff ? "true" : "false") + ",";
    json += "\"samplingRate\":500,";
    json += "\"lowCutoff\":0.05,";
    json += "\"highCutoff\":100,";
    json += "\"notch\":50,";

    json += "\"P\":" + jsonFloat(P_amplitude) + ",";
    json += "\"Q\":" + jsonFloat(Q_amplitude) + ",";
    json += "\"R\":" + jsonFloat(R_amplitude) + ",";
    json += "\"S\":" + jsonFloat(S_amplitude) + ",";
    json += "\"T\":" + jsonFloat(T_amplitude) + ",";
    json += "\"J\":" + jsonFloat(J_amplitude) + ",";

    json += "\"heartRate\":" + jsonFloat(ecgHeartRate) + ",";
    json += "\"stDeviation\":" + jsonFloat(stDeviation) + ",";
    json += "\"oldpeak\":" + jsonFloat(oldpeakEstimate) + ",";
    json += "\"stSlope\":" + jsonFloat(stSlope) + ",";
    json += "\"restECG\":" + String(restECG) + ",";
    json += "\"slopeCategory\":" + String(slopeCategory) + ",";
    json += "\"signalQuality\":" + jsonFloat(signalQuality) + ",";

    json += "\"mappingConfidence\":" + jsonFloat(mapped.mappingConfidence) + ",";
    json += "\"outOfDistribution\":" + String(mapped.outOfDistribution ? "true" : "false") + ",";

    json += "\"rlState\":{";
    json += "\"age\":" + jsonFloat(rlState.age) + ",";
    json += "\"sex\":" + jsonFloat(rlState.sex) + ",";
    json += "\"cp\":" + jsonFloat(rlState.cp) + ",";
    json += "\"trestbps\":" + jsonFloat(rlState.trestbps) + ",";
    json += "\"fbs\":" + jsonFloat(rlState.fbs) + ",";
    json += "\"restecg\":" + jsonFloat(rlState.restecg) + ",";
    json += "\"thalach\":" + jsonFloat(rlState.thalach) + ",";
    json += "\"exang\":" + jsonFloat(rlState.exang) + ",";
    json += "\"oldpeak\":" + jsonFloat(rlState.oldpeak) + ",";
    json += "\"slope\":" + jsonFloat(rlState.slope);
    json += "}";

    json += "}";

    server.send(200, "application/json", json);
}

void handleStatus()
{
    handleCors();
    bool leadsOff = digitalRead(LO_PLUS_PIN) || digitalRead(LO_MINUS_PIN);
    String json = "{";
    json += "\"device\":\"ESP32_UNIFIED\"";
    json += ",\"sensors\":[\"MAX30102_PPG\",\"AD8232_ECG\"]";
    json += ",\"ecgLeadsConnected\":" + String(leadsOff ? "false" : "true");
    json += ",\"ppgFingerDetected\":" + String(fingerPresent ? "true" : "false");
    json += ",\"ip\":\"" + WiFi.localIP().toString() + "\"";
    json += ",\"uptime\":" + String(millis() / 1000);
    json += "}";
    server.send(200, "application/json", json);
}

void handlePatient()
{
    handleCors();
    if (server.hasArg("age"))   patientAge = server.arg("age").toInt();
    if (server.hasArg("sex"))   patientSex = server.arg("sex").toInt();
    if (server.hasArg("cp"))    patientCP = server.arg("cp").toInt();
    if (server.hasArg("fbs"))   patientFBS = server.arg("fbs").toInt();
    if (server.hasArg("exang")) patientExang = server.arg("exang").toInt();
    if (server.hasArg("bp"))    patientTrestbps = server.arg("bp").toFloat();
    server.send(200, "application/json", "{\"success\":true}");
}

void handleRoot()
{
    handleCors();
    String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>ELARA Dual Biometric Device</title>";
    html += "<style>body{font-family:sans-serif;background:#050d1b;color:#eaf3ff;text-align:center;padding:2rem;}";
    html += ".card{max-width:500px;margin:auto;background:rgba(255,255,255,0.06);border:1px solid #3fe0ff;border-radius:1rem;padding:2rem;}";
    html += ".num{font-size:2.5rem;font-weight:bold;color:#3fe0ff;} .label{color:#7db3ff;font-size:0.9rem;}</style></head><body>";
    html += "<div class='card'><h2>ELARA Dual Sensor Node</h2><p class='label'>MAX30102 PPG + AD8232 ECG (" + String(WIFI_SSID) + ")</p><hr style='border-color:#3fe0ff33;margin:1.5rem 0;'>";
    html += "<div class='num'>" + String(beatAvg) + " BPM</div><div class='label'>PPG Average Heart Rate</div><br>";
    html += "<div class='num' style='color:#ff5c78;'>" + String(thalach, 1) + " BPM</div><div class='label'>Confirmed Thalach (Max HR)</div><br>";
    html += "<div class='num' style='color:#00ff88;'>" + String(oldpeakEstimate, 2) + " mm</div><div class='label'>ECG ST-Depression (Oldpeak)</div><br>";
    html += "<p style='font-size:0.85rem;color:#7db3ff;'>IP: " + WiFi.localIP().toString() + " | RSSI: " + String(WiFi.RSSI()) + " dBm</p>";
    html += "<p style='font-size:0.8rem;color:#7db3ff;'>Endpoints: <a style='color:#3fe0ff' href='/data'>/data</a> | <a style='color:#00ff88' href='/api/ecg'>/api/ecg</a></p>";
    html += "</div><script>setTimeout(function(){location.reload();},2000);</script></body></html>";
    server.send(200, "text/html", html);
}

// ============================================================================
// ACQUISITION ROUTINES
// ============================================================================

// 1. AD8232 ECG Sample (500 Hz = every 2000 us)
void acquireECGSample()
{
    bool leadsOff = digitalRead(LO_PLUS_PIN) || digitalRead(LO_MINUS_PIN);
    if (leadsOff)
    {
        latestFilteredECG = 0;
        latestQRS = 0;
        return;
    }

    int rawADC = analogRead(ECG_PIN);
    float centered = (float)rawADC - 2048.0f;

    float morphology = morphHP.process(centered);
    morphology = morphLP.process(morphology);
    morphology = notch50.process(morphology);

    float qrs = qrsHP.process(centered);
    qrs = qrsLP.process(qrs);

    latestFilteredECG = morphology;
    latestQRS = qrs;

    ecgBuffer[ecgWriteIndex] = latestFilteredECG;
    qrsBuffer[ecgWriteIndex] = latestQRS;

    dashboardBuffer[dashboardWriteIndex] = latestFilteredECG;
    dashboardWriteIndex = (dashboardWriteIndex + 1) % DASHBOARD_BUFFER_SIZE;

    ecgWriteIndex = (ecgWriteIndex + 1) % ECG_BUFFER_SIZE;
    if (ecgWriteIndex == 0) ecgBufferFull = true;
}

// 2. MAX30102 PPG Sample (~100 Hz = every 10 ms)
void processPPG()
{
    long irValue = particleSensor.getIR();
    if (irValue == 0) return; // Ignore I2C glitch
    currentIrValue = irValue;

    if (fingerPresent)
    {
        if (irValue < FINGER_HYSTERESIS)
        {
            if (fingerDropStartTime == 0) fingerDropStartTime = millis();
            else if (millis() - fingerDropStartTime >= FINGER_REMOVAL_DEBOUNCE_MS)
            {
                fingerPresent = false;
                fingerDropStartTime = 0;
                resetPpgData();
                Serial.println("PPG: No finger | BPM: 0 | Thalach: 0");
                return;
            }
        }
        else
        {
            fingerDropStartTime = 0;
        }
    }
    else
    {
        if (irValue >= FINGER_THRESHOLD)
        {
            fingerPresent = true;
            fingerDropStartTime = 0;
            resetPpgData();
            ir_avg_reg = (int64_t)irValue << 15;
            IR_Average_Estimated = (int32_t)irValue;
            Serial.println("PPG: Finger detected. Reading heart rate...");
        }
        else
        {
            return;
        }
    }

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

                    Serial.print("PPG Beat: ");
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
}

// ============================================================================
// SETUP
// ============================================================================
void setup()
{
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("==========================================");
    Serial.println(" ELARA UNIFIED WEARABLE DEVICE (ESP32)");
    Serial.println(" MAX30102 PPG + AD8232 ECG CONCURRENT");
    Serial.println("==========================================");

    // 1. AD8232 GPIO & ADC Configuration
    pinMode(ECG_PIN, INPUT);
    pinMode(LO_PLUS_PIN, INPUT);
    pinMode(LO_MINUS_PIN, INPUT);
    analogReadResolution(ADC_RESOLUTION);
    analogSetPinAttenuation(ECG_PIN, ADC_11db);
    setupEcgFilters();

    for (int i = 0; i < ECG_BUFFER_SIZE; i++)
    {
        ecgBuffer[i] = 0;
        qrsBuffer[i] = 0;
    }

    // 2. MAX30102 I2C Configuration (SDA: 21, SCL: 22)
    Wire.begin(21, 22);
    Wire.setClock(100000);
    Wire.setTimeOut(100);

    if (particleSensor.begin(Wire, I2C_SPEED_STANDARD))
    {
        Serial.println("✓ MAX30102 PPG sensor detected.");
        particleSensor.setup(0x3F, 4, 2, 200, 411, 4096);
        particleSensor.setPulseAmplitudeRed(0x0A);
        particleSensor.setPulseAmplitudeGreen(0);
        particleSensor.setPulseAmplitudeIR(0x3F);
    }
    else
    {
        Serial.println("⚠️ MAX30102 not detected. Check I2C wiring (SDA->21, SCL->22). Continuing with ECG.");
    }

    // 3. WiFi Configuration
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setTxPower(WIFI_POWER_17dBm);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

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
        Serial.println("==========================================");
        Serial.println(" >>> WIFI CONNECTED SUCCESSFULLY! <<<");
        Serial.print(" IP Address: "); Serial.println(WiFi.localIP());
        Serial.println(" Stream URLs:");
        Serial.print("   - PPG (Heart Rate): http://"); Serial.print(WiFi.localIP()); Serial.println("/data");
        Serial.print("   - ECG (Waveform):   http://"); Serial.print(WiFi.localIP()); Serial.println("/api/ecg");
        Serial.println("==========================================");

        MDNS.begin("elara-device");
        MDNS.addService("http", "tcp", 80);

        server.on("/", HTTP_GET, handleRoot);
        server.on("/data", HTTP_GET, handleGetData);
        server.on("/data", HTTP_OPTIONS, handleOptions);
        server.on("/api/ecg", HTTP_GET, handleECG);
        server.on("/api/ecg", HTTP_OPTIONS, handleOptions);
        server.on("/api/status", HTTP_GET, handleStatus);
        server.on("/api/status", HTTP_OPTIONS, handleOptions);
        server.on("/api/patient", HTTP_GET, handlePatient);
        server.on("/api/patient", HTTP_OPTIONS, handleOptions);

        server.begin();
        Serial.println("Unified Web Server listening on port 80.");
    }
    else
    {
        Serial.println();
        Serial.println("WiFi connection attempt timed out. Continuing in local Serial mode.");
    }

    Serial.println();
    Serial.println("Ready. Both sensors active.");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop()
{
    static unsigned long nextEcgSampleTime = micros();
    static unsigned long lastPpgSampleTime = 0;
    static unsigned long lastStatusPrintTime = 0;
    static unsigned long lastWifiCheck = 0;

    unsigned long currentMicros = micros();
    unsigned long currentMillis = millis();

    // 1. Precise 500 Hz AD8232 ECG Acquisition (every 2000 us)
    if ((long)(currentMicros - nextEcgSampleTime) >= 0)
    {
        nextEcgSampleTime += ECG_SAMPLE_INTERVAL_US;
        acquireECGSample();
    }

    // 2. 100 Hz MAX30102 PPG Sampling (every 10 ms)
    if (currentMillis - lastPpgSampleTime >= 10)
    {
        lastPpgSampleTime = currentMillis;
        processPPG();
    }

    // 3. WebServer Handling
    server.handleClient();

    // 4. Background WiFi reconnect
    if (WiFi.status() != WL_CONNECTED && currentMillis - lastWifiCheck >= 15000)
    {
        lastWifiCheck = currentMillis;
        WiFi.reconnect();
    }

    // 5. Periodic status output
    if (currentMillis - lastStatusPrintTime >= 1000)
    {
        lastStatusPrintTime = currentMillis;
        bool leadsOff = digitalRead(LO_PLUS_PIN) || digitalRead(LO_MINUS_PIN);

        Serial.print("PPG: [IR: ");
        Serial.print(currentIrValue);
        Serial.print(" | HR: ");
        Serial.print(beatAvg);
        Serial.print(" | Thalach: ");
        Serial.print(thalach, 1);
        Serial.print("] || ECG: [Leads: ");
        Serial.print(leadsOff ? "OFF" : "OK");
        Serial.print(" | HR: ");
        Serial.print(ecgHeartRate, 1);
        Serial.print(" | ST: ");
        Serial.print(stDeviation, 2);
        Serial.print(" | Oldpeak: ");
        Serial.print(oldpeakEstimate, 2);
        Serial.println("]");
    }

    // Prevent timing lock
    if ((long)(micros() - nextEcgSampleTime) > 100000)
    {
        nextEcgSampleTime = micros() + ECG_SAMPLE_INTERVAL_US;
    }
}
