/**
 * ParameterDrawer
 * 
 * Slide-out drawer for adjusting inference parameters.
 * Respects model capabilities — disables unsupported params.
 */

import { useCallback, useMemo } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { DEFAULT_PARAMETERS } from '../../constants/default-parameters';
import type { InferenceParameters } from '../../types/parameters';
import styles from './ParameterDrawer.module.css';

export function ParameterDrawer(): JSX.Element {
  const open = useAppStore((s) => s.paramDrawerOpen);
  const setOpen = useAppStore((s) => s.setParamDrawerOpen);
  const params = useAppStore((s) => s.inferenceParams);
  const setParams = useAppStore((s) => s.setInferenceParams);
  const selectedModelId = useAppStore((s) => s.selectedModelId);

  const model = useMemo(
    () => MODEL_REGISTRY.find((m) => m.id === selectedModelId),
    [selectedModelId]
  );

  const caps = model?.capabilities;

  const update = useCallback(
    (partial: Partial<InferenceParameters>) => setParams({ ...params, ...partial }),
    [params, setParams]
  );

  const reset = useCallback(() => setParams({ ...DEFAULT_PARAMETERS }), [setParams]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.backdrop}
            onClick={() => setOpen(false)}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
      <div className={styles.drawer} data-open={open} aria-label="Parameters">
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>Parameters</span>
          <button
            className={styles.closeButton}
            onClick={() => setOpen(false)}
            type="button"
            aria-label="Close parameters"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.drawerBody}>
          {/* Temperature */}
          <div className={styles.paramGroup}>
            <label className={styles.paramLabel}>
              Temperature
              <span className={styles.paramValue}>
                {params.temperature ?? 'auto'}
              </span>
            </label>
            <input
              className={styles.slider}
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={params.temperature ?? 1}
              onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
              aria-label="Temperature"
            />
          </div>

          {/* Top P */}
          <div className={styles.paramGroup}>
            <label className={styles.paramLabel}>
              Top P
              <span className={styles.paramValue}>
                {params.topP ?? 'auto'}
              </span>
            </label>
            <input
              className={styles.slider}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={params.topP ?? 1}
              onChange={(e) => update({ topP: parseFloat(e.target.value) })}
              aria-label="Top P"
            />
          </div>

          {/* Top K (if supported) */}
          {caps?.supportsTopK && (
            <div className={styles.paramGroup}>
              <label className={styles.paramLabel}>
                Top K
                <span className={styles.paramValue}>
                  {params.topK ?? 'off'}
                </span>
              </label>
              <input
                className={styles.slider}
                type="range"
                min={1}
                max={100}
                step={1}
                value={params.topK ?? 40}
                onChange={(e) => update({ topK: parseInt(e.target.value, 10) })}
                aria-label="Top K"
              />
            </div>
          )}

          {/* Max Output Tokens — Dynamic / No hard limit */}
          <div className={styles.paramGroup}>
            <label className={styles.paramLabel}>
              Max Tokens
              <span className={styles.paramValue}>
                {params.maxOutputTokens === null ? 'Dynamic (auto)' : params.maxOutputTokens.toLocaleString()}
              </span>
            </label>
            <div className={styles.dynamicTokenRow}>
              <button
                className={styles.tokenModeBtn}
                data-active={params.maxOutputTokens === null}
                onClick={() => update({ maxOutputTokens: null })}
                type="button"
              >
                Dynamic
              </button>
              <button
                className={styles.tokenModeBtn}
                data-active={params.maxOutputTokens !== null}
                onClick={() => update({ maxOutputTokens: model?.maxOutputTokens ?? 4096 })}
                type="button"
              >
                Custom
              </button>
            </div>
            {params.maxOutputTokens !== null && (
              <input
                className={styles.tokenInput}
                type="number"
                min={1}
                step={256}
                value={params.maxOutputTokens}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val > 0) update({ maxOutputTokens: val });
                }}
                aria-label="Custom max output tokens"
              />
            )}
            <span className={styles.paramHint}>
              Dynamic lets the model decide. No artificial cap applied.
            </span>
          </div>

          {/* Frequency Penalty */}
          {caps?.supportsFrequencyPenalty && (
            <div className={styles.paramGroup}>
              <label className={styles.paramLabel}>
                Frequency Penalty
                <span className={styles.paramValue}>
                  {params.frequencyPenalty ?? 0}
                </span>
              </label>
              <input
                className={styles.slider}
                type="range"
                min={-2}
                max={2}
                step={0.1}
                value={params.frequencyPenalty ?? 0}
                onChange={(e) => update({ frequencyPenalty: parseFloat(e.target.value) })}
                aria-label="Frequency penalty"
              />
            </div>
          )}

          {/* Presence Penalty */}
          {caps?.supportsPresencePenalty && (
            <div className={styles.paramGroup}>
              <label className={styles.paramLabel}>
                Presence Penalty
                <span className={styles.paramValue}>
                  {params.presencePenalty ?? 0}
                </span>
              </label>
              <input
                className={styles.slider}
                type="range"
                min={-2}
                max={2}
                step={0.1}
                value={params.presencePenalty ?? 0}
                onChange={(e) => update({ presencePenalty: parseFloat(e.target.value) })}
                aria-label="Presence penalty"
              />
            </div>
          )}

          {/* Repetition Penalty */}
          {caps?.supportsRepetitionPenalty && (
            <div className={styles.paramGroup}>
              <label className={styles.paramLabel}>
                Repetition Penalty
                <span className={styles.paramValue}>
                  {params.repetitionPenalty ?? 1}
                </span>
              </label>
              <input
                className={styles.slider}
                type="range"
                min={1}
                max={2}
                step={0.05}
                value={params.repetitionPenalty ?? 1}
                onChange={(e) => update({ repetitionPenalty: parseFloat(e.target.value) })}
                aria-label="Repetition penalty"
              />
            </div>
          )}

          {caps?.supportsThinking && (
            <>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Extended Thinking</span>
                <button
                  className={styles.toggle}
                  data-on={params.thinkingEnabled}
                  onClick={() => update({ thinkingEnabled: !params.thinkingEnabled })}
                  type="button"
                  role="switch"
                  aria-checked={params.thinkingEnabled}
                  aria-label="Toggle thinking"
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
              {params.thinkingEnabled && (
                <div className={styles.paramGroup}>
                  <span className={styles.paramLabel}>Thinking Level</span>
                  <div className={styles.thinkingLevels}>
                    {(['low', 'medium', 'high', 'x-high'] as const).map((level) => (
                      <button
                        key={level}
                        className={styles.levelButton}
                        data-active={params.thinkingLevel === level}
                        onClick={() => update({ thinkingLevel: level })}
                        type="button"
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Stream toggle */}
          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Stream Response</span>
            <button
              className={styles.toggle}
              data-on={params.streamEnabled}
              onClick={() => update({ streamEnabled: !params.streamEnabled })}
              type="button"
              role="switch"
              aria-checked={params.streamEnabled}
              aria-label="Toggle streaming"
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>

          <button className={styles.resetButton} onClick={reset} type="button">
            <RotateCcw size={14} aria-hidden="true" />
            Reset to Defaults
          </button>
        </div>
      </div>
    </>
  );
}
