import { min, max, sortBy } from 'lodash'

const approxMedian = values => sortBy(values)[Math.floor(values.length / 2)]

const SHADOW_COLOR = 'rgba(0,0,0,0.5)';
const TEXT_COLOR = 'white';

const indexToGridLocation = (index, length) => (
    {
        x: index % length,
        y: Math.floor(index / length),
    }
)

export default function renderContourLabels(canvas, values, majorContour, minorContour, fontSize) {

    const { width } = canvas;

    const median = approxMedian(values)
    const gridSize = Math.sqrt(values.length)

    const candidateContour = Math.round(approxMedian(values) / majorContour) * majorContour;

    const isNearGridCentre = ({ x, y }) => {
        return (x > gridSize * 0.25) &&
            (x < gridSize * 0.75) &&
            (y > gridSize * 0.25) &&
            (y < gridSize * 0.75)
    }

    const candidateValues = values.map((value, i) => ({ value, index: i })).filter(valueWithIndex => {
        const gridLocation = indexToGridLocation(valueWithIndex.index, gridSize)
        return isNearGridCentre(gridLocation)
    })

    const valuesOnly = candidateValues.map(valueWithIndex => valueWithIndex.value)

    const minValue = min(valuesOnly)
    const maxValue = max(valuesOnly)

    if (candidateContour < minValue || candidateContour > maxValue) { return canvas }

    const bestValueWithIndex = sortBy(candidateValues, valueWithIndex => Math.abs(valueWithIndex.value - candidateContour))[0]

    if (Math.abs(bestValueWithIndex.value - candidateContour) > minorContour * 0.5) { return canvas }

    const gridLocation = indexToGridLocation(bestValueWithIndex.index, gridSize)

    const x = gridLocation.x * width / gridSize
    const y = gridLocation.y * width / gridSize

    var context = canvas.getContext('2d');

    /*
    context.strokeStyle = 'rgba(255,255,255,0.5)';
    context.lineWidth = 1;
    context.strokeRect(1, 1, width - 1, width - 1);
    */

    const label = `${candidateContour} m`;
    context.font = `bold ${fontSize}px Arial`;
    context.textAlign = 'center';

    context.lineWidth = 3;
    context.strokeStyle = SHADOW_COLOR;
    context.strokeText(label, x, y);

    context.fillStyle = TEXT_COLOR;
    context.fillText(label, x, y);

    return canvas
}