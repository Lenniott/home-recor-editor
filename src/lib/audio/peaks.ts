/**
 * Downsamples PCM samples into fixed-width min/max columns for cheap
 * canvas rendering, regardless of take length or zoom level.
 */

export interface PeakColumns {
  min: Float32Array;
  max: Float32Array;
}

/**
 * Downsample the [startSample, endSample) range of `samples` into
 * `columns` min/max pairs. Used directly by the waveform view so it only
 * ever pays for the columns it's about to paint.
 */
export function computePeaksRange(
  samples: Float32Array,
  startSample: number,
  endSample: number,
  columns: number,
): PeakColumns {
  const min = new Float32Array(columns);
  const max = new Float32Array(columns);
  const rangeLength = Math.max(0, endSample - startSample);

  if (columns <= 0 || rangeLength <= 0) return { min, max };

  const samplesPerColumn = rangeLength / columns;

  for (let col = 0; col < columns; col++) {
    const from = startSample + Math.floor(col * samplesPerColumn);
    const to = Math.min(samples.length, startSample + Math.floor((col + 1) * samplesPerColumn));

    if (from >= to || from < 0 || from >= samples.length) {
      min[col] = 0;
      max[col] = 0;
      continue;
    }

    let colMin = Infinity;
    let colMax = -Infinity;
    for (let i = from; i < to; i++) {
      const v = samples[i];
      if (v < colMin) colMin = v;
      if (v > colMax) colMax = v;
    }
    min[col] = colMin;
    max[col] = colMax;
  }

  return { min, max };
}

/** Downsample the whole buffer into `columns` min/max pairs. */
export function computePeaks(samples: Float32Array, columns: number): PeakColumns {
  return computePeaksRange(samples, 0, samples.length, columns);
}
