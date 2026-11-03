// Arduino prototype-generation compatibility declarations
struct FeatureRange;
struct MappingResult;

/*
================================================================================
 X-REACH ECG SENSOR + CLEVELAND DOMAIN MAPPING PIPELINE
================================================================================

 Hardware:
   ESP32
   AD8232 ECG sensor

 Main purpose:
   1. Acquire ECG from AD8232
   2. Filter the ECG signal (0.05-100 Hz bandpass + 50 Hz notch)
   3. Reconstruct clean/displayable ECG waveform
   4. Detect ECG landmarks (P, Q, R, S, T, J)
   5. Calculate ECG parameters:
        Heart Rate
        ST deviation
        ST slope
        Oldpeak estimate
        RestECG estimate
   6. Combine ECG + manually entered patient parameters
   7. Map/validate values into the Cleveland Heart Disease feature domain
   8. Generate the RL input state
   9. Send ECG + parameters to the web dashboard and REST API
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <math.h>

// ============================================================================
// TYPE DEFINITIONS MOVED ABOVE ALL FUNCTIONS
// Required because Arduino IDE auto-generates function prototypes.
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

/*
--------------------------------------------------------------------------------
 Mapping result structure
--------------------------------------------------------------------------------
*/
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

/*
================================================================================
 SECTION 1
 PIN DEFINITIONS AND HARDWARE CONFIGURATION
================================================================================
*/
const char* WIFI_SSID     = "Mobitel_4G_B69AC";
const char* WIFI_PASSWORD = "242EML67850";

// AD8232 OUTPUT -> ESP32 GPIO34
// AD8232 LO+    -> ESP32 GPIO25
// AD8232 LO-    -> ESP32 GPIO26
#define ECG_PIN       34
#define LO_PLUS_PIN   25
#define LO_MINUS_PIN  26

// ADC configuration
#define ADC_RESOLUTION 12
#define ADC_MAX_VALUE  4095

/*
================================================================================
 SECTION 2
 ECG SAMPLING / ACQUISITION CONFIGURATION
================================================================================
*/
const float SAMPLE_RATE = 500.0f;
const unsigned long SAMPLE_INTERVAL_US = 2000;  // 1 / 500 Hz

// ECG analysis buffer
const int ECG_BUFFER_SIZE = 1000;               // 2 seconds at 500 Hz

// Dashboard samples
const int DASHBOARD_BUFFER_SIZE = 300;

// Raw / filtered ECG buffers
float ecgBuffer[ECG_BUFFER_SIZE];
float qrsBuffer[ECG_BUFFER_SIZE];

int ecgWriteIndex = 0;
bool ecgBufferFull = false;

// Dashboard buffer
float dashboardBuffer[DASHBOARD_BUFFER_SIZE];
int dashboardWriteIndex = 0;

/*
================================================================================
 SECTION 3
 DIGITAL FILTER CONFIGURATION
================================================================================
*/
class Biquad
{
public:
    float b0 = 1.0f;
    float b1 = 0.0f;
    float b2 = 0.0f;
    float a1 = 0.0f;
    float a2 = 0.0f;

    float x1 = 0.0f;
    float x2 = 0.0f;
    float y1 = 0.0f;
    float y2 = 0.0f;

    void reset()
    {
        x1 = 0;
        x2 = 0;
        y1 = 0;
        y2 = 0;
    }

    float process(float x)
    {
        float y =
            b0 * x +
            b1 * x1 +
            b2 * x2 -
            a1 * y1 -
            a2 * y2;

        x2 = x1;
        x1 = x;

        y2 = y1;
        y1 = y;

        return y;
    }
};

// Filter objects
Biquad morphHP;
Biquad morphLP;
Biquad notch50;

Biquad qrsHP;
Biquad qrsLP;

void setupHighPass(Biquad &f, float frequency, float Q)
{
    float w0 = 2.0f * PI * frequency / SAMPLE_RATE;
    float alpha = sin(w0) / (2.0f * Q);
    float cosw = cos(w0);

    float b0 =  (1.0f + cosw) / 2.0f;
    float b1 = -(1.0f + cosw);
    float b2 =  (1.0f + cosw) / 2.0f;

    float a0 = 1.0f + alpha;
    float a1 = -2.0f * cosw;
    float a2 = 1.0f - alpha;

    f.b0 = b0 / a0;
    f.b1 = b1 / a0;
    f.b2 = b2 / a0;
    f.a1 = a1 / a0;
    f.a2 = a2 / a0;

    f.reset();
}

void setupLowPass(Biquad &f, float frequency, float Q)
{
    float w0 = 2.0f * PI * frequency / SAMPLE_RATE;
    float alpha = sin(w0) / (2.0f * Q);
    float cosw = cos(w0);

    float b0 = (1.0f - cosw) / 2.0f;
    float b1 = 1.0f - cosw;
    float b2 = (1.0f - cosw) / 2.0f;

    float a0 = 1.0f + alpha;
    float a1 = -2.0f * cosw;
    float a2 = 1.0f - alpha;

    f.b0 = b0 / a0;
    f.b1 = b1 / a0;
    f.b2 = b2 / a0;
    f.a1 = a1 / a0;
    f.a2 = a2 / a0;

    f.reset();
}

void setupNotch(Biquad &f, float frequency, float Q)
{
    float w0 = 2.0f * PI * frequency / SAMPLE_RATE;
    float alpha = sin(w0) / (2.0f * Q);
    float cosw = cos(w0);

    float b0 = 1.0f;
    float b1 = -2.0f * cosw;
    float b2 = 1.0f;

    float a0 = 1.0f + alpha;
    float a1 = -2.0f * cosw;
    float a2 = 1.0f - alpha;

    f.b0 = b0 / a0;
    f.b1 = b1 / a0;
    f.b2 = b2 / a0;
    f.a1 = a1 / a0;
    f.a2 = a2 / a0;

    f.reset();
}

void setupFilters()
{
    // ECG morphology path: 0.05 Hz -> 100 Hz + 50 Hz notch
    setupHighPass(morphHP, 0.05f, 0.707f);
    setupLowPass(morphLP, 100.0f, 0.707f);
    setupNotch(notch50, 50.0f, 20.0f);

    // QRS detection path: 5 Hz -> 20 Hz
    setupHighPass(qrsHP, 5.0f, 0.707f);
    setupLowPass(qrsLP, 20.0f, 0.707f);
}

/*
================================================================================
 SECTION 4
 PATIENT INPUT PARAMETERS
================================================================================
*/
int patientAge = 25;
int patientSex = 1;
int patientCP = 3;
int patientFBS = 0;
int patientExang = 0;
float patientTrestbps = 120.0f;

/*
================================================================================
 SECTION 5
 CLEVELAND DOMAIN MAPPING CONFIGURATION
================================================================================
*/
float mapContinuousToCleveland(float value, FeatureRange range, bool &outOfRange)
{
    outOfRange = false;

    if (value < range.minimum)
    {
        outOfRange = true;
        return range.minimum;
    }

    if (value > range.maximum)
    {
        outOfRange = true;
        return range.maximum;
    }

    return value;
}

int mapRestECG(float stDeviation, float tAmplitude, float signalQuality)
{
    if (signalQuality < 0.40f)
    {
        return 0; // Poor signal: do not claim abnormality
    }

    if (fabs(stDeviation) > 0.15f)
    {
        return 1; // ST-T wave abnormality
    }

    return 0; // Normal
}

int mapSlope(float stSlope)
{
    if (stSlope > 0.002f)
        return 1;       // upsloping (Cleveland value 1)

    if (stSlope < -0.002f)
        return 3;       // downsloping (Cleveland value 3)

    return 2;           // flat (Cleveland value 2)
}

float mapOldpeak(float rawOldpeak, bool &outOfRange)
{
    return mapContinuousToCleveland(rawOldpeak, oldpeakRange, outOfRange);
}

MappingResult buildClevelandMappedState(
    float rawHeartRate,
    float rawOldpeak,
    float rawSTSlope,
    float rawSTDeviation,
    float rawTAmplitude,
    float signalQuality
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

    result.restecg = mapRestECG(rawSTDeviation, rawTAmplitude, signalQuality);
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
    if (signalQuality < 0.60f) confidence -= 0.20f;

    result.mappingConfidence = constrain(confidence, 0.0f, 1.0f);

    return result;
}

/*
================================================================================
 SECTION 6
 ECG LANDMARK / SIGNAL ANALYSIS VARIABLES
================================================================================
*/
float latestFilteredECG = 0.0f;
float latestQRS = 0.0f;

int latestRIndex = -1;

float P_amplitude = NAN;
float Q_amplitude = NAN;
float R_amplitude = NAN;
float S_amplitude = NAN;
float T_amplitude = NAN;
float J_amplitude = NAN;

float heartRate = 0.0f;
float stDeviation = 0.0f;
float oldpeakEstimate = 0.0f;
float stSlope = 0.0f;

float signalQuality = 0.0f;

int restECG = 0;
int slopeCategory = 2;

/*
================================================================================
 SECTION 7
 CHRONOLOGICAL BUFFER CONSTRUCTION
================================================================================
*/
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

/*
================================================================================
 SECTION 8
 STATISTICAL UTILITIES
================================================================================
*/
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
        if (data[i] > value)
        {
            value = data[i];
            index = i;
        }
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
        if (data[i] < value)
        {
            value = data[i];
            index = i;
        }
    }
    return index;
}

/*
================================================================================
 SECTION 9
 R-PEAK DETECTION
================================================================================
*/
int detectLatestRPeak()
{
    if (chronologicalCount < 400) return -1;

    int start = 100;
    int end = chronologicalCount - 100;
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

        if (!localMaximum) continue;
        if (chronologicalQRS[i] < threshold) continue;

        if ((i - lastPeak) < refractorySamples)
        {
            if (latestPeak >= 0 && chronologicalQRS[i] > chronologicalQRS[latestPeak])
            {
                latestPeak = i;
                lastPeak = i;
            }
            continue;
        }

        latestPeak = i;
        lastPeak = i;
    }

    return latestPeak;
}

/*
================================================================================
 SECTION 10
 HEART RATE CALCULATION
================================================================================
*/
float calculateHeartRateFromPeaks()
{
    if (chronologicalCount < 500) return 0.0f;

    float mean = calculateMean(chronologicalQRS, 100, chronologicalCount - 100);
    float std = calculateStd(chronologicalQRS, 100, chronologicalCount - 100);
    float threshold = mean + 0.65f * std;

    const int refractory = 100;
    int previousPeak = -1000;
    int peakCount = 0;
    int intervals[8];

    for (int i = 102; i < chronologicalCount - 102; i++)
    {
        bool localMaximum =
            chronologicalQRS[i] > chronologicalQRS[i - 1] &&
            chronologicalQRS[i] >= chronologicalQRS[i + 1];

        if (!localMaximum) continue;
        if (chronologicalQRS[i] < threshold) continue;
        if ((i - previousPeak) < refractory) continue;

        if (previousPeak >= 0)
        {
            int interval = i - previousPeak;
            if (interval >= 250 && interval <= 1000)
            {
                if (peakCount < 8)
                {
                    intervals[peakCount++] = interval;
                }
            }
        }

        previousPeak = i;
    }

    if (peakCount == 0) return 0.0f;

    float sum = 0.0f;
    for (int i = 0; i < peakCount; i++) sum += intervals[i];

    float averageSamples = sum / (float)peakCount;
    float rrSeconds = averageSamples / SAMPLE_RATE;

    if (rrSeconds <= 0) return 0.0f;
    return 60.0f / rrSeconds;
}

/*
================================================================================
 SECTION 11
 ECG P-Q-R-S-T-J LANDMARK CONSTRUCTION
================================================================================
*/
void analyzeLatestBeat()
{
    latestRIndex = detectLatestRPeak();
    if (latestRIndex < 0) return;

    int pStart = latestRIndex - (int)(0.20f * SAMPLE_RATE);
    int pEnd   = latestRIndex - (int)(0.08f * SAMPLE_RATE);

    int qStart = latestRIndex - (int)(0.06f * SAMPLE_RATE);
    int qEnd   = latestRIndex - (int)(0.01f * SAMPLE_RATE);

    int sStart = latestRIndex + (int)(0.01f * SAMPLE_RATE);
    int sEnd   = latestRIndex + (int)(0.08f * SAMPLE_RATE);

    int tStart = latestRIndex + (int)(0.10f * SAMPLE_RATE);
    int tEnd   = latestRIndex + (int)(0.40f * SAMPLE_RATE);

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

    int jIndex = latestRIndex + (int)(0.06f * SAMPLE_RATE);
    if (jIndex >= 0 && jIndex < chronologicalCount)
    {
        J_amplitude = chronologicalECG[jIndex];
    }

    int baselineStart = latestRIndex - (int)(0.20f * SAMPLE_RATE);
    int baselineEnd   = latestRIndex - (int)(0.12f * SAMPLE_RATE);

    if (baselineStart < 0) baselineStart = 0;
    if (baselineEnd > chronologicalCount) baselineEnd = chronologicalCount;

    float baseline = calculateMean(chronologicalECG, baselineStart, baselineEnd);

    if (jIndex >= 0 && jIndex < chronologicalCount)
    {
        stDeviation = chronologicalECG[jIndex] - baseline;
    }

    int st1Index = latestRIndex + (int)(0.06f * SAMPLE_RATE);
    int st2Index = latestRIndex + (int)(0.12f * SAMPLE_RATE);

    if (st1Index >= 0 && st2Index < chronologicalCount)
    {
        float dt = 0.06f;
        stSlope = (chronologicalECG[st2Index] - chronologicalECG[st1Index]) / dt;
    }

    oldpeakEstimate = fabs(stDeviation) / 1000.0f;
    restECG = mapRestECG(stDeviation, T_amplitude, signalQuality);
    slopeCategory = mapSlope(stSlope);
}

/*
================================================================================
 SECTION 12
 SIGNAL QUALITY ESTIMATION
================================================================================
*/
float calculateSignalQuality()
{
    if (chronologicalCount < 250) return 0.0f;

    int start = chronologicalCount - 250;
    float mean = calculateMean(chronologicalECG, start, chronologicalCount);
    float std = calculateStd(chronologicalECG, start, chronologicalCount);

    if (std < 1.0f) return 0.20f;
    if (std > 2000.0f) return 0.30f;
    if (std > 1000.0f) return 0.55f;
    if (std > 500.0f) return 0.75f;

    return 0.90f;
}

/*
================================================================================
 SECTION 13
 RL STATE CONSTRUCTION
================================================================================
*/
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

RLState rlState;

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

/*
================================================================================
 SECTION 14
 DASHBOARD / WEB SERVER & CORS
================================================================================
*/
WebServer server(80);

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

void handleECG()
{
    handleCors();

    constructChronologicalSignal();
    signalQuality = calculateSignalQuality();
    heartRate = calculateHeartRateFromPeaks();
    analyzeLatestBeat();

    MappingResult mapped = buildClevelandMappedState(
        heartRate,
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

    json += "\"heartRate\":" + jsonFloat(heartRate) + ",";
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
    json += "\"device\":\"ESP32\"";
    json += ",\"sensor\":\"AD8232\"";
    json += ",\"connected\":" + String(leadsOff ? "false" : "true");
    json += ",\"samplingRate\":500";
    json += ",\"morphologyBand\":\"0.05-100 Hz\"";
    json += ",\"qrsBand\":\"5-20 Hz\"";
    json += ",\"notchFrequency\":50";
    json += ",\"mapping\":\"Cleveland Domain Alignment\"";
    json += ",\"targetUsedForMapping\":false";
    json += "}";

    server.send(200, "application/json", json);
}

void handleRoot()
{
    handleCors();
    server.send(200, "text/plain", "ELARA AD8232 ECG Sensor API is running. Access /api/ecg or /api/status.");
}

/*
================================================================================
 SECTION 20
 ECG SAMPLING
================================================================================
*/
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

    // Filter paths
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

/*
================================================================================
 SECTION 21
 SETUP
================================================================================
*/
void setup()
{
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("==========================================");
    Serial.println(" X-REACH AD8232 ECG SYSTEM STARTING");
    Serial.println("==========================================");

    pinMode(ECG_PIN, INPUT);
    pinMode(LO_PLUS_PIN, INPUT);
    pinMode(LO_MINUS_PIN, INPUT);

    analogReadResolution(ADC_RESOLUTION);
    analogSetPinAttenuation(ECG_PIN, ADC_11db);

    setupFilters();

    for (int i = 0; i < ECG_BUFFER_SIZE; i++)
    {
        ecgBuffer[i] = 0;
        qrsBuffer[i] = 0;
    }

    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("Connecting to Wi-Fi");
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40)
    {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.println("Wi-Fi connected successfully!");
        Serial.print("ESP32 IP Address: ");
        Serial.println(WiFi.localIP());

        if (MDNS.begin("elara-ecg"))
        {
            Serial.println("mDNS started: http://elara-ecg.local/");
        }

        server.on("/", HTTP_GET, handleRoot);
        server.on("/api/ecg", HTTP_GET, handleECG);
        server.on("/api/ecg", HTTP_OPTIONS, handleOptions);
        server.on("/api/status", HTTP_GET, handleStatus);
        server.on("/api/status", HTTP_OPTIONS, handleOptions);
        server.on("/api/patient", HTTP_GET, handlePatient);
        server.on("/api/patient", HTTP_OPTIONS, handleOptions);

        server.begin();
        Serial.println("Web server listening on port 80");
    }
    else
    {
        Serial.println("Wi-Fi connection failed. Continuing in local Serial mode.");
    }
}

/*
================================================================================
 SECTION 22
 MAIN LOOP
================================================================================
*/
void loop()
{
    static unsigned long nextSampleTime = micros();
    unsigned long currentTime = micros();

    if ((long)(currentTime - nextSampleTime) >= 0)
    {
        nextSampleTime += SAMPLE_INTERVAL_US;
        acquireECGSample();
    }

    server.handleClient();

    if ((long)(micros() - nextSampleTime) > 100000)
    {
        nextSampleTime = micros() + SAMPLE_INTERVAL_US;
    }
}
