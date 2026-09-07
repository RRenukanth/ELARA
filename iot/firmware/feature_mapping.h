// Sensor-reading -> canonical-feature mapping used by elara_device.ino.
// See ../communication/feature-mapping.md for the full rationale and the
// features intentionally NOT sent by this scaffold (restecg, oldpeak, slope,
// which require ECG waveform analysis not implemented here).

#ifndef ELARA_FEATURE_MAPPING_H
#define ELARA_FEATURE_MAPPING_H

// Only features this scaffold can actually populate from its wired sensors.
// Everything else must come from the patient's manual input in the app --
// do not fabricate values for features the device cannot measure.
struct PartialFeatureReading {
  bool hasThalach = false;
  int thalach = 0; // beats per minute, from MAX30102

  bool hasTrestbps = false;
  int trestbps = 0; // mmHg, from an attached oscillometric BP module (if present)

  bool hasFbs = false;
  int fbs = 0; // 0 or 1, from an attached glucometer module (if present), thresholded at 120 mg/dL
};

#endif
