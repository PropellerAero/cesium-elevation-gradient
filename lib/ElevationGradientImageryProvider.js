import Cartographic from 'cesium/Source/Core/Cartographic'
import Color from 'cesium/Source/Core/Color'
import Credit from 'cesium/Source/Core/Credit'
import EllipsoidGeodesic from 'cesium/Source/Core/EllipsoidGeodesic'
import Event from 'cesium/Source/Core/Event' // jshint ignore:line
import WebMercatorTilingScheme from 'cesium/Source/Core/WebMercatorTilingScheme'
import Rectangle from 'cesium/Source/Core/Rectangle'
import when from 'cesium/Source/ThirdParty/when'
import TileRenderer from './TileRenderer'
import renderContourLabels from './renderContourLabels'

const DEFAULT_TILE_SIZE = 256
const DEFAULT_TERRAIN_TILE_SIZE = 65
const MINIMUM_TILE_LEVEL = 13
const MAJOR_CONTOUR = 10
const MINOR_CONTOUR = 1
const CREDIT = '© Propeller Aerobotics'
const FONT_SIZE = 16
const CONTOUR_OPACITY_THRESHOLD = 0.05

const mix = (x, y, a) => (x * (1.0 - a) + y * a)

const mixColors = (x, y, a) => new Color(
    mix(x.red, y.red, a),
    mix(x.green, y.green, a),
    mix(x.blue, y.blue, a),
    mix(x.alpha, y.alpha, a),
)

function calcGradientColour(gradientStops, z) {
    if (z <= gradientStops[0].value) {
        return gradientStops[0].color
    }

    for (let i = 1; i < gradientStops.length; ++i) {
        if (z <= gradientStops[i].value) {
            const a = (z - gradientStops[i - 1].value) / (gradientStops[i].value - gradientStops[i - 1].value)
            return mixColors(gradientStops[i - 1].color, gradientStops[i].color, a)
        }
    }

    return gradientStops[gradientStops.length - 1].color
}

class ElevationGradientImageryProvider {
    constructor({
        valueSampler,
        maskSampler,
        tilingScheme,
        ellipsoid,
        providerCache,
        contourColor = Color.WHITE,
        textOutlineColor = Color.BLACK.withAlpha(0.5),
        tileSize = DEFAULT_TILE_SIZE,
        gridSize = DEFAULT_TERRAIN_TILE_SIZE,
        minimumTileLevel = MINIMUM_TILE_LEVEL,
        contourAmount = 1,
        gradientAmount = 1,
        majorContour = MAJOR_CONTOUR,
        minorContour = MINOR_CONTOUR,
        credit = CREDIT,
        extent,
        gradient,
        fontSize = FONT_SIZE,
        hillshadeAmount = 1,
        formatContourLabel = value => `${value} m`,
        useSlope = 0,
        readyPromise = when.resolve(),
        linearUnitFactor = 1,
    }) {
        this.valueSampler = valueSampler
        this.maskSampler = maskSampler
        this.cache = providerCache

        this.tilingScheme = tilingScheme || new WebMercatorTilingScheme({ ellipsoid })
        this.contourColor = contourColor
        this.textOutlineColor = textOutlineColor
        this.errorEvent = new Event()

        // Render resolution
        this.tileSize = tileSize
        this.maskSize = tileSize
        this.gridSize = gridSize

        this.fontSize = fontSize

        this.minimumTileLevel = minimumTileLevel

        this.gradientAmount = gradientAmount
        this.contourAmount = contourAmount
        this.majorContour = majorContour
        this.minorContour = minorContour
        this.formatContourLabel = formatContourLabel
        this.gradientStops = gradient
        this.useSlope = useSlope
        this.linearUnitFactor = linearUnitFactor

        this.credit = typeof (credit === 'string') ? new Credit(credit) : credit

        this.tileRenderer = new TileRenderer({
            width: this.tileSize,
            height: this.tileSize,
            gradientStops: gradient,
            gradientAmount,
            hillshadeAmount,
            contourAmount,
            majorContour,
            minorContour,
            contourOpacityThreshold: CONTOUR_OPACITY_THRESHOLD,
            useSlope,
            contourColor,
        })

        this.blankCanvasPromise = when.resolve(makeBlankCanvas(this.tileSize))

        this.readyPromise = readyPromise
        this.extent = extent
        this._ready = false
        this.readyPromise.then(() => {
            this._ready = true
        })
    }

    getTileCredits() {
        return this.credit
    }

    requestImage = (x, y, tileLevel) => {
        const { gridSize, maskSize, minorContour, majorContour, fontSize, formatContourLabel, contourAmount, useSlope, linearUnitFactor } = this

        const getGradientAlpha = z => calcGradientColour(this.gradientStops, z).alpha
        const shouldRenderContourLabel = (z) => {
            if (useSlope) { return true }
            const alpha = getGradientAlpha(z)
            return alpha > CONTOUR_OPACITY_THRESHOLD
        }

        if (tileLevel < this.minimumTileLevel) {
            return this.blankCanvasPromise
        }

        const rectangle = this.tilingScheme.tileXYToRectangle(x, y, tileLevel)

        if (this.extent && !Rectangle.intersection(rectangle, this.extent)) {
            return this.blankCanvasPromise
        }

        const tileDimension = getRectangleGeodesicSize(rectangle, linearUnitFactor)

        const handleRequest = ([maskSamples, valueSamples]) => {
            const canvas = this.tileRenderer.render(
                valueSamples,
                maskSamples,
                gridSize,
                maskSize,
                tileDimension,
            )

            return contourAmount > 0.01 ? renderContourLabels({
                canvas,
                values: valueSamples,
                maskSamples,
                majorContour,
                minorContour,
                fontSize,
                formatLabel: formatContourLabel,
                shouldRenderContourLabel,
                textColor: this.contourColor,
                textOutlineColor: this.textOutlineColor,
            }) : canvas
        }

        const cacheKey = `${x}:${y}:${tileLevel}`

        const cacheRequest = (result) => {
            if (this.cache) {
                this.cache.set(cacheKey, result)
            }
            return result
        }

        const response = this.cache && this.cache.has(cacheKey) ? this.cache.get(cacheKey) : null

        if (response) {
            return when.resolve(handleRequest(response))
        }

        const valueSampleLocations = rectangleToCartographicGrid(rectangle, gridSize, gridSize)
        const valuePromise = when(this.valueSampler(valueSampleLocations, tileLevel))

        let maskPromise
        if (this.maskSampler) {
            const maskSampleLocations = rectangleToCartographicGrid(rectangle, maskSize, maskSize)
            maskPromise = when(this.maskSampler(maskSampleLocations, tileLevel))
        } else {
            maskPromise = when.resolve(Array(maskSize * maskSize).fill(1))
        }

        return when.all([maskPromise, valuePromise])
            .then(cacheRequest)
            .then(handleRequest)
            .otherwise(() => this.blankCanvasPromise)
    }

    pickFeatures() {
        return undefined
    }

    get tileWidth() {
        return this.tileSize
    }

    get tileHeight() {
        return this.tileSize
    }

    get maximumLevel() {
        return undefined
    }

    get minimumLevel() {
        return undefined
    }

    get rectangle() {
        return this.tilingScheme.rectangle
    }

    get tileDiscardPolicy() {
        return undefined
    }

    get ready() {
        return this._ready
    }

    get hasAlphaChannel() {
        return true
    }
}

const rectangleToCartographicGrid = (rectangle, divisionsX, divisionsY) => {
    const n = divisionsX * divisionsY
    const result = new Array(n)
    for (let i = 0; i < n; ++i) {
        const x = i % divisionsX
        const y = Math.floor(i / divisionsX)

        const nx = x / (divisionsX - 1)
        const ny = 1.0 - y / (divisionsY - 1)

        const longitude = (1.0 - nx) * rectangle.west + nx * rectangle.east
        const latitude = (1.0 - ny) * rectangle.south + ny * rectangle.north

        result[i] = new Cartographic(longitude, latitude)
    }
    return result
}

const getRectangleGeodesicSize = (r, linearUnitFactor) => {
    const northEast = Rectangle.northeast(r)
    const northWest = Rectangle.northwest(r)
    const southWest = Rectangle.southwest(r)

    const widthGeodesic = new EllipsoidGeodesic(northWest, northEast)
    const heightGeodesic = new EllipsoidGeodesic(southWest, northWest)

    return {
        x: widthGeodesic.surfaceDistance / linearUnitFactor,
        y: heightGeodesic.surfaceDistance / linearUnitFactor,
    }
}

const heightsFromTileGeo = (tileGeo) => {
    const heightOffset = tileGeo._structure.heightOffset
    const heightScale = tileGeo._structure.heightScale

    const result = new Array(tileGeo._buffer.length)
    tileGeo._buffer.forEach((e, i) => {
        result[i] = e * heightScale + heightOffset
    })

    return result
}

const makeBlankCanvas = (size) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    return canvas
}

export default ElevationGradientImageryProvider
