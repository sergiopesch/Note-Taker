// Minimal WAV encoder for PCM 16-bit little-endian
// Adapted from common WebAudio WAV encoding patterns.

export async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer()

  // Decode with WebAudio
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const wavArrayBuffer = audioBufferToWav(audioBuffer)
    return new Blob([wavArrayBuffer], { type: 'audio/wav' })
  } finally {
    try {
      await audioContext.close()
    } catch {
      // ignore
    }
  }
}

// Create a WAV blob from raw mono Float32 samples.
export function float32ToWav(samples: Float32Array, sampleRate: number): Blob {
  const wavArrayBuffer = float32ToWavArrayBuffer(samples, sampleRate)
  return new Blob([wavArrayBuffer], { type: 'audio/wav' })
}

function float32ToWavArrayBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1
  const format = 1 // PCM
  const bitDepth = 16

  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample

  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return arrayBuffer
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16

  // Interleave channels
  const samples = interleave(buffer)
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample

  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return arrayBuffer
}

function interleave(buffer: AudioBuffer): Float32Array {
  const numChannels = buffer.numberOfChannels
  const length = buffer.length

  if (numChannels === 1) {
    return buffer.getChannelData(0)
  }

  const result = new Float32Array(length * numChannels)
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch))

  let idx = 0
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      result[idx++] = channels[ch][i]
    }
  }

  return result
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
