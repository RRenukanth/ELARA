-- ELARA Backend - Add algorithm selection to predictions (SQLite)
--
-- Records which RL algorithm (ppo / dqn / q-learning / demo) produced a
-- given prediction, now that patients can choose which trained model to
-- use (see backend/services/modelService.js listAvailableModels() /
-- predict(features, { algorithm })). Existing rows default to 'ppo' as the
-- app's default algorithm at the time this migration was written -- see
-- modelService.js DEFAULT_ALGORITHM (prefers 'ppo' when available).

ALTER TABLE predictions ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'ppo'
    CHECK(algorithm IN ('ppo', 'dqn', 'q-learning', 'demo'));

CREATE INDEX IF NOT EXISTS idx_predictions_algorithm ON predictions(algorithm);
