// MAX Image Segmenter ColorMap
const MAX_IMGSEG_SIZE = 512

export const getColorMap = async (imageData, segmentMap, options={ }) => {
  let canvas = await Jimp.read(imageData)
  canvas.scaleToFit(MAX_IMGSEG_SIZE,MAX_IMGSEG_SIZE)
  const flatSegMap = segmentMap.reduce((a, b) => a.concat(b), [])
  const objTypes = [...new Set(flatSegMap)].map(x => OBJ_LIST[x])
  const segments = objTypes.map(type => {
    return {
      object: type,
      color: getColorName(OBJ_LIST.indexOf(type))
    }
  })  
  const data = canvas.bitmap.data
  let objColor = [0, 0, 0]
  const bgVal = OBJ_LIST.indexOf('background')
  flatSegMap.forEach((s, i) => {
    if (s !== bgVal) {
      objColor = getColor(s)
      data[(i * 4)] = objColor[0] // red channel
      data[(i * 4) + 1] = objColor[1] // green channel
      data[(i * 4) + 2] = objColor[2] // blue channel
      data[(i * 4) + 3] = 200 // alpha
    }
  })
  const base64 = URLtoB64(await canvas.getBase64Async(Jimp.AUTO))
  let binary = fixBinary(atob(base64))
  let blob = new Blob([binary], {type: 'image/png'})
  return { 
    blob, 
    segments,
    width: canvas.bitmap.width,
    height: canvas.bitmap.height
  }
}

const COLOR_MAP = {
  green: [0, 128, 0],
  red: [255, 0, 0],
  gray: [192, 192, 192],
  purple: [160, 32, 240],
  pink: [255, 185, 80],
  teal: [30, 128, 128],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255]
}
const COLOR_LIST = Object.values(COLOR_MAP)
const COLOR_NAMES = Object.keys(COLOR_MAP)
const getColor = pixel => COLOR_LIST[pixel % COLOR_LIST.length]
const getColorName = pixel => COLOR_NAMES[pixel % COLOR_NAMES.length]

const OBJ_LIST = [
  'background', 'airplane', 'bicycle', 'bird', 'boat', 
  'bottle', 'bus', 'car', 'cat', 'chair', 'cow', 'dining table', 
  'dog', 'horse', 'motorbike', 'person', 'potted plant', 'sheep', 
  'sofa', 'train', 'tv'
]
let objMap = {} 
OBJ_LIST.forEach((x,i)=> objMap[x]=i)
const OBJ_MAP = objMap

// MAX Human Pose Estimator
const MAX_HPOSE_SIZE = 432

export const getPoseLines = async (imageData, poseData, options={ }) => {
  const { lineColor, linePad } = options
  const canvas = await Jimp.read(imageData)
  canvas.scaleToFit(MAX_HPOSE_SIZE, MAX_HPOSE_SIZE)
  const padSize = linePad || 2
  poseData.map(obj => obj.poseLines).forEach((skeleton, i) => {
    const colorName = lineColor || getColorName(i)
    skeleton.forEach(line => {
      const xMin = line[0]
      const yMin = line[1]
      const xMax = line[2]
      const yMax = line[3]
      drawLine(canvas, xMin, yMin, xMax, yMax, padSize, colorName)
    })
  })
  const base64 = URLtoB64(await canvas.getBase64Async(Jimp.AUTO))
  let binary = fixBinary(atob(base64))
  let blob = new Blob([binary], {type: 'image/png'})
  return { 
    blob,
    width: canvas.bitmap.width,
    height: canvas.bitmap.height
  }
}

// Bounding Boxes

// Object Detector Bounding Box
export const getObjectBoxes = async (imageData, boxData, options={ }) => {
  const { lineColor, linePad, fontColor, fontSize, modelType } = options
  const canvas = await Jimp.read(imageData)
  const objectMap = boxData.map((obj, i) => {
    return {
      object: obj.label,
      color : lineColor || getColorName(i)
    }
  })  
  const { width, height } = canvas.bitmap
  console.log('start font load')
  let textColor = fontColor === 'white' ? 'white' : 'black'
  let textSize = ['8', '16', '32', '64', '128'].includes(String(fontSize)) ? fontSize : '32'
  const font = await Jimp.loadFont(`https://raw.githubusercontent.com/kastentx/max-viz-utils/master/fonts/open-sans/open-sans-${textSize}-${textColor}/open-sans-${textSize}-${textColor}.fnt`)
  console.log('end font load')
  const padSize = linePad || 2
  const modelName = modelType || 'object-detector'
  boxData.map(obj => obj.detection_box).forEach((box, i) => {
    const boxColor = objectMap[i].color
    const { xMin, xMax, yMin, yMax } = getBoxCoords(box, modelName, width, height)
    rect(canvas, xMin, yMin, xMax, yMax, padSize, boxColor)
    // LABEL GENERATION
    const text = getBoxLabel(boxData[i], modelName)
    const textHeight = Jimp.measureTextHeight(font, text)
    const xTagMax = Jimp.measureText(font, text) + (padSize * 2) + xMin
    const yTagMin = yMin - textHeight > 0 ? yMin - textHeight : yMin
    rectFill(canvas, xMin, yTagMin, xTagMax, textHeight + yTagMin, padSize, boxColor)
    canvas.print(font, xMin + padSize, yTagMin, text)
  })
  const base64 = URLtoB64(await canvas.getBase64Async(Jimp.AUTO))
  let binary = fixBinary(atob(base64))
  let blob = new Blob([binary], { type: 'image/png' })
  return { 
    blob,
    objects: objectMap,
    width: canvas.bitmap.width,
    height: canvas.bitmap.height
  }
}

// Object Detector Cropping Boxes
export const cropObjectBoxes = async (imageData, boxData, options={ }) => {
  const { modelType } = options
  const source = await Jimp.read(imageData)
  let cropList = []
  
  boxData.map(obj => ({ box: obj.detection_box, label: obj.label }))
    .forEach(async (bBox, i) => {
      const canvas = source.clone()
      const { width, height } = canvas.bitmap
      const { box, label } = bBox
      const { xMin, xMax, yMin, yMax } = getBoxCoords(box, modelType, width, height)
      cropRect(canvas, xMin, yMin, xMax, yMax)
      const base64 = URLtoB64(await canvas.getBase64Async(Jimp.AUTO))
      let binary = fixBinary(atob(base64))
      let blob = new Blob([binary], { type: 'image/png' })
      cropList.push({
        blob,
        width,
        height,
        label
      })
    })
    return cropList
}

// Label Generation


// Basic Draw Methods
const drawLine = (img, xMin, yMin, xMax, yMax, padSize, color) => {
  const xLength = Math.abs(xMax - xMin)
  const yLength = Math.abs(yMax - yMin)
  const steps = xLength > yLength ? xLength : yLength
  const xStep = (xMax - xMin) / steps
  const yStep = (yMax - yMin) / steps
  let x = xMin
  let y = yMin
  for (let s of range(0, steps)) {
    x = x + xStep
    y = y + yStep
    for (let i of range(x - padSize, x + padSize)) {
      img.setPixelColor(Jimp.cssColorToHex(color), i, y)
    }
    for (let j of range(y - padSize, y + padSize)) {
      img.setPixelColor(Jimp.cssColorToHex(color), x, j)
    }  
  }
}

const rect = (img, xMin, yMin, xMax, yMax, padSize, color) => 
  drawRect(img, xMin, yMin, xMax, yMax, padSize, color, false)

const rectFill = (img, xMin, yMin, xMax, yMax, padSize, color) => 
  drawRect(img, xMin, yMin, xMax, yMax, padSize, color, true)

const drawRect = (img, xMin, yMin, xMax, yMax, padSize, color, isFilled) => {
  for (let x of range(xMin, xMax)) {
    for (let y of range(yMin, yMax)) { 
      if (withinRange(y, yMin, padSize) || withinRange(x, xMin, padSize) || 
          withinRange(y, yMax, padSize) || withinRange(x, xMax, padSize)) {
        img.setPixelColor(Jimp.cssColorToHex(color), x, y)
      } else if (isFilled && (y <= (yMax + padSize) && x <= (xMax + padSize))) {
        img.setPixelColor(Jimp.cssColorToHex(color), x, y)
      }
    }
  }
}

const cropRect = (img, xMin, yMin, xMax, yMax) => {
  const rectHeight = yMax - yMin
  const rectWidth = xMax - xMin
  img.crop(xMin, yMin, rectWidth, rectHeight)
}

// Basic Utility Functions
const getBoxCoords = (box, modelType, width, height) => {
  if (modelType === 'facial-recognizer') {
    return {
      xMax: box[2],
      xMin: box[0],
      yMax: box[3],
      yMin: box[1]
    }
  } else {
    return {
      xMax: box[3] * width,
      xMin: box[1] * width,
      yMax: box[2] * height,
      yMin: box[0] * height
    }
  }
}

const getBoxLabel = (boxData, modelType) => {
  if (modelType === 'object-detector') {
    return boxData.label
  } else if (modelType === 'facial-age-estimator') {
    return boxData.age_estimation
  } else if (modelType === 'facial-emotion-classifier') {
    return boxData.emotion_predictions[0].label
  } else if (modelType === 'facial-recognizer') {
    return ''
  }
}

const flatten = (a) => Array.isArray(a) ? [].concat(...a.map(flatten)) : a

const B64toURL = base64 => `data:image/png;base64,${base64}`

const URLtoB64 = dataURL => dataURL.split(',')[1]

const fixBinary = (bin) => {
  let length = bin.length
  let buf = new ArrayBuffer(length)
  let arr = new Uint8Array(buf)
  for (let i = 0; i < length; i++) {
    arr[i] = bin.charCodeAt(i)
  }
  return buf
}

const getScaledFont = (width, color) => {
  if (width > 1600)
    return color === 'black' ? Jimp.FONT_SANS_128_BLACK : Jimp.FONT_SANS_128_WHITE
  else if (width > 700)
    return color === 'black' ? Jimp.FONT_SANS_32_BLACK : Jimp.FONT_SANS_32_WHITE
  else
  return color === 'black' ? Jimp.FONT_SANS_16_BLACK : Jimp.FONT_SANS_16_WHITE
}

function* range(start, end) {
  for (let i = start; i <= end; i++) {
    yield i
  }
}

const withinRange = (i, line, range) =>
  (line-range<=i) && (i<=line+range)