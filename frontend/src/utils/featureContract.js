// Frontend mirror of backend/utils/featureContract.js. Keep the canonical
// order and patient-facing labels in sync with the backend contract.
// This does NOT replace server-side validation -- the backend re-validates
// everything independently.

export const CANONICAL_FEATURE_ORDER = [
  "thalach",
  "restecg",
  "oldpeak",
  "slope",
  "age",
  "sex",
  "cp",
  "exang",
  "trestbps",
  "fbs",
];

export const FEATURE_FIELDS = [
  {
    key: "age",
    label: "Age",
    type: "number",
    min: 1,
    max: 120,
    help: "Your age in years.",
  },
  {
    key: "sex",
    label: "Sex",
    type: "select",
    options: [
      { value: 1, label: "Male" },
      { value: 0, label: "Female" },
    ],
  },
  {
    key: "cp",
    label: "Chest Pain Type",
    type: "select",
    options: [
      { value: 0, label: "Typical angina" },
      { value: 1, label: "Atypical angina" },
      { value: 2, label: "Non-anginal pain" },
      { value: 3, label: "Asymptomatic" },
    ],
  },
  {
    key: "trestbps",
    label: "Resting Blood Pressure (mm Hg)",
    type: "number",
    min: 50,
    max: 250,
    help: "Measured at rest.",
  },
  {
    key: "fbs",
    label: "Fasting Blood Sugar > 120 mg/dL",
    type: "select",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" },
    ],
  },
  {
    key: "restecg",
    label: "Resting ECG Result",
    type: "select",
    options: [
      { value: 0, label: "Normal" },
      { value: 1, label: "ST-T wave abnormality" },
      { value: 2, label: "Left ventricular hypertrophy" },
    ],
  },
  {
    key: "thalach",
    label: "Maximum Heart Rate Achieved",
    type: "number",
    min: 60,
    max: 250,
  },
  {
    key: "exang",
    label: "Exercise-Related Chest Discomfort",
    type: "select",
    options: [
      { value: 0, label: "No" },
      { value: 1, label: "Yes" },
    ],
  },
  {
    key: "oldpeak",
    label: "ECG Stress-Test Change (ST depression)",
    type: "number",
    min: 0,
    max: 10,
    step: "0.1",
  },
  {
    key: "slope",
    label: "ECG ST-Segment Slope",
    type: "select",
    options: [
      { value: 0, label: "Downsloping" },
      { value: 1, label: "Flat" },
      { value: 2, label: "Upsloping" },
    ],
  },
];
