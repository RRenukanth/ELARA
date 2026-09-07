const { test } = require("node:test");
const assert = require("node:assert/strict");

const limeExplainerService = require("../services/limeExplainerService");
const { CANONICAL_FEATURE_ORDER, FEATURE_VALIDATION } = require("../utils/featureContract");

// A representative, valid feature set (values must be within
// FEATURE_VALIDATION ranges) to explain in every test below.
const BASE_FEATURES = {
  thalach: 150,
  restecg: 0,
  oldpeak: 1.0,
  slope: 1,
  age: 55,
  sex: 1,
  cp: 2,
  exang: 0,
  trestbps: 130,
  fbs: 0,
};

test("explain() returns one entry per canonical feature", async () => {
  const scoreFn = async () => 0.5; // constant score: no feature should matter
  const factors = await limeExplainerService.explain(BASE_FEATURES, scoreFn, { numSamples: 40, seed: 1 });

  assert.equal(factors.length, CANONICAL_FEATURE_ORDER.length);
  for (const f of factors) {
    assert.ok(CANONICAL_FEATURE_ORDER.includes(f.factor));
    assert.equal(typeof f.contribution, "number");
  }
});

test("explain() assigns near-zero contribution to every feature when the score never changes", async () => {
  const scoreFn = async () => 0.42;
  const factors = await limeExplainerService.explain(BASE_FEATURES, scoreFn, { numSamples: 60, seed: 2 });

  for (const f of factors) {
    assert.ok(Math.abs(f.contribution) < 0.05, `expected near-zero contribution for ${f.factor}, got ${f.contribution}`);
  }
});

test("explain() assigns the largest positive contribution to the feature that actually drives a synthetic score", async () => {
  // Synthetic ground truth: score depends heavily on trestbps (normalized)
  // and barely on anything else. LIME should recover trestbps as the
  // dominant contributor with a positive sign (higher trestbps -> higher score).
  const rule = FEATURE_VALIDATION.trestbps;
  const scoreFn = async (features) => {
    const normalizedTrestbps = (features.trestbps - rule.min) / (rule.max - rule.min);
    return Math.min(0.99, Math.max(0.01, 0.1 + 0.8 * normalizedTrestbps));
  };

  const factors = await limeExplainerService.explain(BASE_FEATURES, scoreFn, { numSamples: 150, seed: 3 });

  // Sorted by |contribution| descending -- trestbps should be first.
  assert.equal(factors[0].factor, "trestbps");
  assert.ok(factors[0].contribution > 0, "trestbps contribution should be positive");

  // Every other feature's contribution should be much smaller in magnitude.
  for (const f of factors.slice(1)) {
    assert.ok(
      Math.abs(f.contribution) < Math.abs(factors[0].contribution),
      `expected ${f.factor}'s contribution to be smaller than trestbps's`
    );
  }
});

test("explain() recovers a negative contribution when higher feature values lower the score", async () => {
  const rule = FEATURE_VALIDATION.age;
  const scoreFn = async (features) => {
    const normalizedAge = (features.age - rule.min) / (rule.max - rule.min);
    return Math.min(0.99, Math.max(0.01, 0.9 - 0.8 * normalizedAge));
  };

  const factors = await limeExplainerService.explain(BASE_FEATURES, scoreFn, { numSamples: 150, seed: 4 });

  assert.equal(factors[0].factor, "age");
  assert.ok(factors[0].contribution < 0, "age contribution should be negative");
});

test("explain() is deterministic for a fixed seed", async () => {
  const scoreFn = async (features) => (features.cp >= 2 ? 0.8 : 0.2);

  const first = await limeExplainerService.explain(BASE_FEATURES, scoreFn, { numSamples: 50, seed: 42 });
  const second = await limeExplainerService.explain(BASE_FEATURES, scoreFn, { numSamples: 50, seed: 42 });

  assert.deepEqual(first, second);
});

test("generateSample() keeps every feature within its valid range", () => {
  const { createRng } = require("../utils/prng");
  const rng = createRng(7);

  for (let i = 0; i < 50; i++) {
    const sample = limeExplainerService.generateSample(BASE_FEATURES, rng);
    for (const key of CANONICAL_FEATURE_ORDER) {
      const rule = FEATURE_VALIDATION[key];
      if (rule.type === "enum") {
        assert.ok(rule.values.includes(sample[key]), `${key}=${sample[key]} not in ${rule.values}`);
      } else {
        assert.ok(sample[key] >= rule.min && sample[key] <= rule.max, `${key}=${sample[key]} out of [${rule.min}, ${rule.max}]`);
      }
    }
  }
});
