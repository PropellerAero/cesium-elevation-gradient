import { min, max, sortBy } from 'lodash'

const approxMedian = values => sortBy(values)[Math.floor(values.length / 2)]

const OUTLINE_COLOR = 'rgba(0,0,0,0.5)'
const TEXT_COLOR = 'white'
const ANGLE_OFFSET = Math.PI * 0.5
const DEBUG_MODE = false
const BORDER = 0.25
const DELTA_SIZE = 0.2

const indexToGridLocation = (index, gridSize) => (
    {
        x: index % gridSize,
        y: Math.floor(index / gridSize),
    }
)

const gridLocationToIndex = (gridLocation, gridSize) => gridLocation.x + gridLocation.y * gridSize

const calculateGradientAngle = (values, gridSize, gridLocation) => {
    const valueAtDelta = (dx, dy) => {
        const deltaGridLocation = {
            x: gridLocation.x + dx,
            y: gridLocation.y + dy,
        }
        return values[gridLocationToIndex(deltaGridLocation, gridSize)]
    }

    const deltaSize = Math.floor(gridSize * DELTA_SIZE)

    const dx = valueAtDelta(deltaSize, 0) - valueAtDelta(-deltaSize, 0)
    const dy = valueAtDelta(0, deltaSize) - valueAtDelta(0, -deltaSize)

    return Math.atan2(dy, dx) + ANGLE_OFFSET
}

export default function renderContourLabels({
    canvas,
    values,
    maskSamples,
    majorContour,
    minorContour,
    fontSize,
    formatLabel,
    shouldRenderContourLabel,
    textColor,
    textOutlineColor,
}) {
    const { width } = canvas

    const median = approxMedian(values)
    const gridSize = Math.sqrt(values.length)

    const candidateContour = Math.round(approxMedian(values) / majorContour) * majorContour

    const isNearGridCentre = ({ x, y }) => (x > gridSize * BORDER) &&
            (x < gridSize * (1 - BORDER)) &&
            (y > gridSize * BORDER) &&
            (y < gridSize * (1 - BORDER))

    const candidateValues = values.map((value, i) => ({ value, index: i })).filter((valueWithIndex) => {
        const gridLocation = indexToGridLocation(valueWithIndex.index, gridSize)
        return isNearGridCentre(gridLocation)
    })

    const valuesOnly = candidateValues.map(valueWithIndex => valueWithIndex.value)

    const minValue = min(valuesOnly)
    const maxValue = max(valuesOnly)

    if (candidateContour < minValue || candidateContour > maxValue || !shouldRenderContourLabel(candidateContour)) { return canvas }

    const bestValueWithIndex = sortBy(candidateValues, valueWithIndex => Math.abs(valueWithIndex.value - candidateContour))[0]

    if (Math.abs(bestValueWithIndex.value - candidateContour) > minorContour * 0.5) { return canvas }

    const gridLocation = indexToGridLocation(bestValueWithIndex.index, gridSize)

    const x = gridLocation.x * width / gridSize
    const y = gridLocation.y * width / gridSize

    const maskSize = Math.sqrt(maskSamples.length)
    const maskGridLocation = {
        x: Math.round(gridLocation.x * maskSize / gridSize),
        y: Math.round(gridLocation.y * maskSize / gridSize),
    }
    const maskValue = maskSamples[gridLocationToIndex(maskGridLocation, maskSize)]
    if (maskValue < 0.9) { return canvas }

    const gradientAngle = calculateGradientAngle(values, gridSize, gridLocation)

    const context = canvas.getContext('2d')

    if (DEBUG_MODE) {
        context.strokeStyle = textOutlineColor.toCssColorString()
        context.lineWidth = 1
        context.strokeRect(1, 1, width - 1, width - 1)
    }

    const label = formatLabel(candidateContour)
    context.font = `bold ${fontSize}px Arial`
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    context.translate(x, y)
    context.rotate(gradientAngle)

    context.lineWidth = 3
    context.strokeStyle = textOutlineColor.toCssColorString()
    context.strokeText(label, 0, 0)

    context.fillStyle = textColor.toCssColorString()
    context.fillText(label, 0, 0)

    if (DEBUG_MODE) {
        context.beginPath()
        context.arc(0, 0, 3, 0, 2 * Math.PI, false)
        context.fillStyle = 'red'
        context.fill()
    }

    return canvas
}
