"""
Predictor NILM v9 — selaras nilm_inference.py + perbaikan kipas/kombinasi.
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from typing import Any, Optional

import numpy as np


class MetaScaler:
  def __init__(self, mean: list[float], scale: list[float]):
    self.mean_ = np.array(mean, dtype=np.float32)
    self.scale_ = np.array(
      [float(item) if float(item) != 0.0 else 1.0 for item in scale],
      dtype=np.float32,
    )

  def transform(self, data: np.ndarray) -> np.ndarray:
    return (data - self.mean_) / self.scale_


def build_feature_vector(raw: dict) -> np.ndarray:
  def _f(key: str, fallback: float = 0.0) -> float:
    try:
      value = float(raw[key])
      return value if np.isfinite(value) else fallback
    except Exception:
      return fallback

  voltage = _f("voltage", 220.0)
  current = _f("current", 0.0)
  power = _f("power", 0.0)
  power_factor = max(0.0, min(_f("power_factor", 0.9), 1.0))
  frequency = _f("frequency", 50.0)

  apparent_power = voltage * current
  reactive_power = apparent_power * np.sqrt(max(0.0, 1.0 - power_factor**2))
  power_ratio = power / (apparent_power + 1e-6)

  return np.array(
    [voltage, current, power, power_factor, frequency, apparent_power, reactive_power, power_ratio],
    dtype=np.float32,
  )


class NilmV9Predictor:
  def __init__(self, model_dir: Path):
    import tensorflow as tf

    model_dir = Path(model_dir).resolve()
    meta_path = model_dir / "meta_nilm.json"
    keras_path = model_dir / "best_nilm_model.keras"

    if not meta_path.exists():
      raise FileNotFoundError(f"meta_nilm.json tidak ditemukan di {model_dir}")
    if not keras_path.exists():
      raise FileNotFoundError(f"best_nilm_model.keras tidak ditemukan di {model_dir}")

    with meta_path.open(encoding="utf-8") as handle:
      self.meta: dict[str, Any] = json.load(handle)

    try:
      register = tf.keras.saving.register_keras_serializable(package="nilm_v9")
    except AttributeError:
      register = tf.keras.utils.register_keras_serializable(package="nilm_v9")

    @register
    class TemporalSum(tf.keras.layers.Layer):
      def call(self, inputs):
        return tf.reduce_sum(inputs, axis=1)

      def get_config(self):
        return super().get_config()

    def weighted_bce(y_true, y_pred):
      return tf.reduce_mean(tf.keras.losses.binary_crossentropy(y_true, y_pred))

    def exact_match(y_true, y_pred):
      pred_bin = tf.cast(y_pred >= 0.5, tf.float32)
      match = tf.reduce_all(tf.equal(pred_bin, y_true), axis=1)
      return tf.reduce_mean(tf.cast(match, tf.float32))

    self.model = tf.keras.models.load_model(
      str(keras_path),
      custom_objects={
        "TemporalSum": TemporalSum,
        "weighted_bce": weighted_bce,
        "exact_match": exact_match,
      },
      compile=False,
      safe_mode=False,
    )

    self.scaler = MetaScaler(self.meta["scaler_mean"], self.meta["scaler_scale"])
    self.window_size = int(self.meta["window_size"])
    self.devices: list[str] = list(self.meta["devices"])
    self.threshold = float(self.meta.get("threshold", 0.5))
    self.device_thresholds: dict[str, float] = {
      str(key): float(value)
      for key, value in (self.meta.get("device_thresholds") or {}).items()
      if isinstance(value, (int, float))
    }
    self.noise_floor_w = float(self.meta.get("noise_floor_w", 3.0))
    self.smooth_n = max(1, int(self.meta.get("smooth_n", 5)))
    self.transition_delta = float(self.meta.get("transition_delta", 30.0))
    self.power_range: dict = dict(self.meta.get("power_range") or {})
    self.session_to_label: dict[str, str] = {
      key: str(value) for key, value in (self.meta.get("session_to_label") or {}).items()
    }

    self._buffer: deque = deque(maxlen=self.window_size)
    self._label_vote_queue: deque = deque(maxlen=self.smooth_n)
    self._prev_apparent: Optional[float] = None

  def reset(self) -> None:
    self._buffer.clear()
    self._label_vote_queue.clear()
    self._prev_apparent = None

  def _median_power_w(self) -> float:
    if not self._buffer:
      return 0.0
    powers = [float(row[2]) for row in self._buffer]
    return float(np.median(powers))

  def _device_threshold(self, device: str) -> float:
    return self.device_thresholds.get(device, self.threshold)

  def _prob_map(self, probs: np.ndarray) -> dict[str, float]:
    return {device: float(probability) for device, probability in zip(self.devices, probs)}

  def _active_from_label(self, label: Optional[str]) -> list[str]:
    if not label or label == "idle":
      return []
    if label == "full_load":
      return list(self.devices)
    parts = {part.strip() for part in label.split("+") if part.strip()}
    return [device for device in self.devices if device in parts]

  def _labels_matching_power(self, power_w: float) -> list[tuple[float, str, int]]:
    if power_w < self.noise_floor_w:
      return [(0.0, "idle", 0)]

    matches: list[tuple[float, str, int]] = []
    for label, rng in self.power_range.items():
      if label == "idle" or not isinstance(rng, list) or len(rng) < 2:
        continue
      lo, hi = float(rng[0]), float(rng[1]) * 1.12
      if lo <= power_w <= hi:
        center = (float(rng[0]) + float(rng[1])) / 2.0
        device_count = len(self._active_from_label(label))
        matches.append((abs(power_w - center), label, device_count))

    # Jarak sama → prefer label lebih sederhana (mis. laptop vs laptop+kipas)
    matches.sort(key=lambda item: (item[0], item[2]))
    return matches

  def _power_fingerprint_label(self, power_w: float) -> Optional[str]:
    matches = self._labels_matching_power(power_w)
    return matches[0][1] if matches else None

  def _model_active_from_probs(self, probs: np.ndarray, power_w: float = 0.0) -> list[str]:
    prob_map = self._prob_map(probs)
    stable = self._median_power_w() or power_w
    active: list[str] = []
    for device in self.devices:
      threshold = self._device_threshold(device)
      # Di zona laptop, kipas butuh prob lebih tinggi agar tidak false-positive
      if device == "kipas" and stable > 50:
        threshold = max(threshold, 0.62)
      if prob_map[device] >= threshold:
        active.append(device)
    return active

  def _label_score(self, label: str, model_set: set[str], prob_map: dict[str, float]) -> float:
    label_active = set(self._active_from_label(label))
    if not label_active:
      return 0.0

    union = model_set | label_active
    jaccard = len(model_set & label_active) / len(union) if union else 0.0
    prob_score = float(np.mean([prob_map.get(device, 0.0) for device in label_active]))
    return 0.55 * jaccard + 0.45 * prob_score

  def _best_label_for_power(self, power_w: float, model_active: list[str], probs: np.ndarray) -> Optional[str]:
    matches = self._labels_matching_power(power_w)
    if not matches:
      return None

    model_set = set(model_active)
    prob_map = self._prob_map(probs)

    if model_set:
      exact = [
        label
        for _, label, _ in matches
        if set(self._active_from_label(label)) == model_set
      ]
      if exact:
        return exact[0]

    best_label = None
    best_score = -1.0
    for distance, label, _ in matches[:10]:
      score = self._label_score(label, model_set, prob_map) - (distance / 120.0)
      if score > best_score:
        best_score = score
        best_label = label

    return best_label

  def _disambiguate_laptop_combo(
    self,
    power_w: float,
    model_active: list[str],
    probs: np.ndarray,
    fallback_label: Optional[str],
  ) -> Optional[str]:
    """Pisahkan laptop+kipas vs laptop+charger saat daya laptop fluktuatif."""
    prob_map = self._prob_map(probs)
    model_set = set(model_active)
    if "laptop" not in model_set:
      return fallback_label

    matches = self._labels_matching_power(power_w)
    candidate_labels = [label for _, label, _ in matches]
    laptop_combos = [
      label
      for label in candidate_labels
      if label.startswith("laptop") and "hair_dryer" not in label
    ]
    if not laptop_combos:
      return fallback_label

    kipas_p = prob_map.get("kipas", 0.0)
    charger_p = prob_map.get("charger_hp", 0.0)
    laptop_p = prob_map.get("laptop", 0.0)

    # Model aktifkan keduanya → pilih sekunder dengan margin probabilitas
    if "kipas" in model_set and "charger_hp" in model_set:
      prefer_kipas = kipas_p >= charger_p + 0.08
      prefer_charger = charger_p >= kipas_p + 0.08
      for label in laptop_combos:
        parts = set(self._active_from_label(label))
        if prefer_kipas and parts == {"laptop", "kipas"}:
          return label
        if prefer_charger and parts == {"laptop", "charger_hp"}:
          return label
        if not prefer_kipas and not prefer_charger and parts == {"laptop", "kipas", "charger_hp"}:
          return label

    if "kipas" in model_set and "charger_hp" not in model_set:
      for label in laptop_combos:
        if set(self._active_from_label(label)) == {"laptop", "kipas"}:
          return label

    if "charger_hp" in model_set and "kipas" not in model_set:
      for label in laptop_combos:
        if set(self._active_from_label(label)) == {"laptop", "charger_hp"}:
          return label

    if laptop_p >= 0.5 and not model_set - {"laptop"}:
      solo = [label for label in laptop_combos if label == "laptop"]
      if solo:
        return solo[0]

    return fallback_label

  def _refine_active_devices(
    self,
    model_active: list[str],
    probs: np.ndarray,
    power_w: float,
  ) -> list[str]:
    if power_w < self.noise_floor_w:
      return []

    stable_power = self._median_power_w() or power_w
    fingerprint_label = self._power_fingerprint_label(stable_power)
    fingerprint_active = self._active_from_label(fingerprint_label)

    # Charger: model sering salah prediksi kipas+laptop di daya rendah
    if stable_power <= 18:
      return fingerprint_active or ["charger_hp"]

    # Kipas & kombinasi kipas (18–50 W): ikuti fingerprint daya stabil
    if 18 < stable_power < 50:
      if fingerprint_active:
        return fingerprint_active
      return model_active

    # Laptop & kombinasi: skor model + median daya (daya laptop fluktuatif)
    if 45 <= stable_power < 195:
      best_label = self._best_label_for_power(stable_power, model_active, probs)
      best_label = self._disambiguate_laptop_combo(stable_power, model_active, probs, best_label)
      best_active = self._active_from_label(best_label)
      if best_active:
        return best_active
      without_hair = [device for device in model_active if device != "hair_dryer"]
      return without_hair if without_hair else model_active

    if stable_power >= 195:
      best_label = self._best_label_for_power(stable_power, model_active, probs)
      best_active = self._active_from_label(best_label)
      if best_active:
        return best_active
      return model_active

    if fingerprint_active:
      return fingerprint_active

    return model_active

  def _vote_label(self, label: str) -> str:
    self._label_vote_queue.append(label)
    if not self._label_vote_queue:
      return label
    return max(set(self._label_vote_queue), key=self._label_vote_queue.count)

  def _canonical_label(self, active: list[str]) -> str:
    if not active:
      return "idle"

    active_set = set(active)
    for label in self.session_to_label.values():
      if label == "idle":
        continue
      if label == "full_load" and active_set == set(self.devices):
        return label
      parts = {part.strip() for part in label.split("+") if part.strip()}
      ordered = [device for device in self.devices if device in parts]
      if set(ordered) == active_set:
        return label

    return "+".join(device for device in self.devices if device in active_set)

  def _compute_detection_confidence(
    self,
    active_devices: list[str],
    probs: np.ndarray,
    buffer_status: str,
    buffer_fill: int,
    label: str,
    power_w: float,
    model_active: list[str],
  ) -> float:
    prob_map = self._prob_map(probs)
    min_buf = max(10, self.window_size // 3)

    if buffer_status == "warming":
      progress = min(1.0, buffer_fill / min_buf)
      return round(18 + progress * 32, 1)

    if not active_devices or label == "idle":
      peak = max(prob_map.values()) if prob_map else 0.0
      return round(max(88.0, (1.0 - peak) * 100.0), 1)

    active_probs = [prob_map[device] for device in active_devices if device in prob_map]
    if not active_probs:
      return 78.0

    max_percent = max(active_probs) * 100.0
    min_percent = min(active_probs) * 100.0
    model_set = set(model_active)
    active_set = set(active_devices)
    refined = active_set != model_set

    if len(active_devices) == 1:
      score = max_percent
      if score < 50 and refined:
        score = max(74.0, min(92.0, 68.0 + score * 0.35))
      return round(min(99.0, score), 1)

    # Kombinasi (termasuk kipas+X): harmonic blend — tidak hanya min rendah
    if min_percent < 1.0:
      min_percent = max_percent * 0.35
    score = (2 * min_percent * max_percent) / (min_percent + max_percent + 1e-6)

    kipas_percent = prob_map.get("kipas", 0.0) * 100.0
    if "kipas" in active_set and kipas_percent >= 40:
      score = max(score, kipas_percent * 0.85 + max_percent * 0.15)

    if refined and score < 68:
      score = max(70.0, 0.45 * min_percent + 0.55 * max_percent)

    return round(min(99.0, score), 1)

  def predict(self, raw: dict) -> dict:
    feat = build_feature_vector(raw)
    power_w = float(feat[2])
    apparent_w = float(feat[5])

    if self._prev_apparent is not None and abs(apparent_w - self._prev_apparent) > self.transition_delta:
      self._buffer.clear()
      self._label_vote_queue.clear()
    self._prev_apparent = apparent_w

    if power_w < self.noise_floor_w:
      self.reset()
      return self._pack("idle", [], [0.0] * len(self.devices), 0, power_w, apparent_w, False, "idle", 96.0)

    self._buffer.append(feat)
    buf_len = len(self._buffer)
    min_buf = max(10, self.window_size // 3)

    if buf_len < min_buf:
      warmup_confidence = round(18 + min(1.0, buf_len / min_buf) * 32, 1)
      return self._pack(
        "filling_buffer",
        [],
        [0.0] * len(self.devices),
        buf_len,
        power_w,
        apparent_w,
        False,
        "warming",
        warmup_confidence,
      )

    buffer_array = np.array(self._buffer, dtype=np.float32)
    if buf_len < self.window_size:
      repeat = int(np.ceil(self.window_size / buf_len))
      window = np.tile(buffer_array, (repeat, 1))[: self.window_size]
    else:
      window = buffer_array[-self.window_size :]

    scaled = self.scaler.transform(window)
    probs = self.model.predict(np.expand_dims(scaled, axis=0), verbose=0)[0]

    model_active = self._model_active_from_probs(probs, power_w)
    refined_active = self._refine_active_devices(model_active, probs, power_w)
    refined_label = self._canonical_label(refined_active)
    final_label = self._vote_label(refined_label)
    final_active = self._active_from_label(final_label)
    status = "ready" if buf_len >= self.window_size else "loading"

    confidence = self._compute_detection_confidence(
      final_active,
      probs,
      status,
      buf_len,
      final_label,
      power_w,
      model_active,
    )

    return self._pack(
      final_label,
      final_active,
      [float(prob) for prob in probs],
      buf_len,
      power_w,
      apparent_w,
      buf_len >= self.window_size,
      status,
      confidence,
    )

  def _pack(
    self,
    label: str,
    active_devices: list[str],
    probs: list[float],
    buffer_fill: int,
    power_w: float,
    apparent_w: float,
    is_ready: bool,
    buffer_status: str,
    confidence: float = 0.0,
  ) -> dict:
    return {
      "label": label,
      "active_devices": active_devices,
      "probs": list(zip(self.devices, probs)),
      "buffer_fill": buffer_fill,
      "power_w": round(power_w, 2),
      "apparent_va": round(apparent_w, 2),
      "is_ready": is_ready,
      "buffer_status": buffer_status,
      "confidence": confidence,
      "model_version": self.meta.get("model_version", "v9_multilabel"),
    }
