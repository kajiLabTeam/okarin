import type { FloorMapImageExtension } from '../storage/presigned-url.js'

export const floorMapMaxSidePx = 20_000
export const floorMapMaxPixels = 100_000_000

export interface FloorMapDimensions {
  width: number
  height: number
}

const pngMagicNumber = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const areValidDimensions = ({ width, height }: FloorMapDimensions) =>
  Number.isInteger(width) &&
  Number.isInteger(height) &&
  width > 0 &&
  height > 0 &&
  width <= floorMapMaxSidePx &&
  height <= floorMapMaxSidePx &&
  width * height <= floorMapMaxPixels

const extractPngDimensions = (bytes: Uint8Array): FloorMapDimensions | undefined => {
  if (
    bytes.byteLength < 24 ||
    !pngMagicNumber.every((value, index) => bytes[index] === value) ||
    new TextDecoder('ascii').decode(bytes.slice(12, 16)) !== 'IHDR'
  ) {
    return undefined
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dimensions = { width: view.getUint32(16), height: view.getUint32(20) }
  return areValidDimensions(dimensions) ? dimensions : undefined
}

const extractSvgDimensions = (bytes: Uint8Array): FloorMapDimensions | undefined => {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const svgTag = /<\s*svg\b[^>]*>/i.exec(text)?.[0]
  if (
    !svgTag ||
    /<\s*script(?:\s|>)/i.test(text) ||
    /<\s*foreignObject(?:\s|>)/i.test(text) ||
    /\son[a-z]+\s*=/i.test(text)
  ) {
    return undefined
  }

  const viewBox = /\bviewBox\s*=\s*["']\s*0\s+0\s+(\d+)\s+(\d+)\s*["']/i.exec(svgTag)
  if (!viewBox) return undefined

  const dimensions = { width: Number(viewBox[1]), height: Number(viewBox[2]) }
  return areValidDimensions(dimensions) ? dimensions : undefined
}

export const extractFloorMapDimensions = (
  bytes: Uint8Array,
  extension: FloorMapImageExtension
): FloorMapDimensions | undefined =>
  extension === 'png' ? extractPngDimensions(bytes) : extractSvgDimensions(bytes)
