import { max, min } from 'lodash'
import elevationGradientVert from './shaders/elevationGradientVert.glsl'
import elevationGradientFrag from './shaders/elevationGradientFrag.glsl'

const Z_FACTOR = 0.75
const ZENITH = 0.7857142857
const AZIMUTH = 2.3571428571
const TO_BYTE = 255

const canvases = {}

const getCanvasAndWebGL = (width, height) => {
    const key = JSON.stringify({ width, height })
    if (!canvases[key]) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
        canvases[key] = {
            canvas,
            gl,
        }
    }
    return canvases[key]
}

class TileRenderer {
    constructor({ width, height, gradientStops, gradientAmount, hillshadeAmount, contourAmount, majorContour, minorContour, contourOpacityThreshold, useSlope, contourColor }) {
        const { canvas, gl } = getCanvasAndWebGL(width, height)
        this.canvasElement = canvas
        this.gl = gl
        if (!this.gl) {
            throw Error('Failed to get WebGL context')
        }

        this.gradientStops = gradientStops

        const modifiedFragmentShader = elevationGradientFrag
            .replace(/GRADIENT_STOP_COUNT/g, this.gradientStops.length.toString())
            .replace(/CONTOUR_OPACITY_THRESHOLD/g, contourOpacityThreshold.toString())

        this.program = createProgram(this.gl, elevationGradientVert, modifiedFragmentShader)
        this.hillshadeAmount = hillshadeAmount
        this.gradientAmount = gradientAmount
        this.contourAmount = contourAmount
        this.majorContour = majorContour
        this.minorContour = minorContour
        this.useSlope = useSlope
        this.contourColor = contourColor
    }

    render(
        heights,
        maskSamples,
        gridDim,
        maskDim,
        tileDimension,
    ) {
        const { gl, program, canvasElement, gradientStops, majorContour, minorContour, gradientAmount, contourAmount, contourColor } = this

        const maskBuffer = new ArrayBuffer(maskSamples.length)
        const mask = new Uint8Array(maskBuffer)
        maskSamples.forEach((maskSample, i) => {
            mask[i] = maskSample * TO_BYTE
        })

        const elevationBuffer = new ArrayBuffer(heights.length * 4)
        const elevations = new Uint8Array(elevationBuffer)

        const minElevation = min(heights)
        const maxElevation = max(heights)
        const deltaElevation = maxElevation - minElevation

        heights.forEach((elevation, i) => {
            const normalizedElevation = deltaElevation < 0.001 ? 0 : (elevation - minElevation) / (maxElevation - minElevation)
            const value = normalizedElevation * TO_BYTE

            // Note: this is incorrect but reduces visual artefacts
            const floorValue = Math.floor(value)
            const frac = value - floorValue
            const fracValue = frac * TO_BYTE

            elevations[i * 4] = value
            elevations[i * 4 + 1] = fracValue
            elevations[i * 4 + 2] = value + 0.5
            elevations[i * 4 + 3] = value + 0.75
        })

        // setup GLSL program
        gl.useProgram(program)

        // look up where the vertex data needs to go.
        const positionLocation = gl.getAttribLocation(program, 'a_position')
        const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')

        // offset by half a pixel
        const textureCoordinateOffset = 0.5 / (gridDim - 1)
        const minUV = textureCoordinateOffset
        const maxUV = 1.0 - textureCoordinateOffset

        // provide texture coordinates for the rectangle.
        const texCoordBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            minUV, minUV,
            maxUV, minUV,
            minUV, maxUV,
            minUV, maxUV,
            maxUV, minUV,
            maxUV, maxUV,
        ]), gl.STATIC_DRAW)
        gl.enableVertexAttribArray(texCoordLocation)
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)

        // Create a texture.
        const elevationTexture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, elevationTexture)

        // Set the parameters so we can render any size image.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

        // Upload the image into the texture.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridDim, gridDim, 0, gl.RGBA, gl.UNSIGNED_BYTE, elevations)

        // Create a texture.
        const maskTexture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, maskTexture)

        // Set the parameters so we can render any size image.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

        // Upload the image into the texture.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, maskDim, maskDim, 0, gl.ALPHA, gl.UNSIGNED_BYTE, mask)

        // Set appropriate uniform
        const setUniformF = (...args) => {
            const uniformType = args.length - 1
            const location = gl.getUniformLocation(program, args[0])
            switch (uniformType) {
            case 1:
                gl.uniform1f(location, args[1])
                break
            case 2:
                gl.uniform2f(location, args[1], args[2])
                break
            case 3:
                gl.uniform3f(location, args[1], args[2], args[3])
                break
            case 4:
                gl.uniform4f(location, args[1], args[2], args[3], args[4])
                break
            default:
                throw new Error('unsupported uniform')
            }
        }

        setUniformF('u_resolution', canvasElement.width, canvasElement.height)
        setUniformF('u_tileElevationRange', minElevation, maxElevation)
        setUniformF('u_textureSize', canvasElement.width, canvasElement.height)
        setUniformF('u_tileDimension', tileDimension.x, tileDimension.y)
        setUniformF('u_zFactor', Z_FACTOR)
        setUniformF('u_zenith', ZENITH)
        setUniformF('u_azimuth', AZIMUTH)
        setUniformF('u_majorContour', majorContour)
        setUniformF('u_minorContour', minorContour)
        setUniformF('u_hillshadeAmount', this.hillshadeAmount)
        setUniformF('u_gradientAmount', gradientAmount)
        setUniformF('u_contourAmount', contourAmount)
        setUniformF('u_useSlope', this.useSlope)
        setUniformF('u_contourColor', contourColor.red, contourColor.green, contourColor.blue, contourColor.alpha)

        const gradientColors = []
        gradientStops.forEach(({ color: { red, green, blue, alpha } }) => {
            gradientColors.push(red * alpha)
            gradientColors.push(green * alpha)
            gradientColors.push(blue * alpha)
            gradientColors.push(alpha)
        })

        const gradientValues = gradientStops.map(({ value }) => value)

        const gradientColorLocation = gl.getUniformLocation(program, 'u_gradientColors')
        gl.uniform4fv(gradientColorLocation, new Float32Array(gradientColors))
        const gradientHeightLocation = gl.getUniformLocation(program, 'u_gradientValues')
        gl.uniform1fv(gradientHeightLocation, new Float32Array(gradientValues))

        // Create a buffer for the position of the rectangle corners.
        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.enableVertexAttribArray(positionLocation)
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

        // lookup the sampler locations.
        const u_image0Location = gl.getUniformLocation(program, 'u_image')
        const u_image1Location = gl.getUniformLocation(program, 'u_mask')

        // set which texture units to render with.
        gl.uniform1i(u_image0Location, 0) // texture unit 0
        gl.uniform1i(u_image1Location, 1) // texture unit 1

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, elevationTexture)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, maskTexture)

        // Set a rectangle the same size as the image.
        setRectangle(gl, 0, 0, canvasElement.width, canvasElement.height)

        // Draw the rectangle.
        gl.drawArrays(gl.TRIANGLES, 0, 6)

        return cloneCanvas(canvasElement)
    }
}

const cloneCanvas = (oldCanvas) => {
    const newCanvas = document.createElement('canvas')
    newCanvas.width = oldCanvas.width
    newCanvas.height = oldCanvas.height

    const context = newCanvas.getContext('2d')
    context.drawImage(oldCanvas, 0, 0)

    return newCanvas
}

const detectShaderError = (gl, shader) => {
    const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
    if (!compiled) {
        const lastError = gl.getShaderInfoLog(shader)
        console.error(`*** Error compiling shader '${shader}':${lastError}`)
    }
}

const createProgram = (gl, vertShaderSource, fragShaderSource) => {
    const program = gl.createProgram()

    const vertShader = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vertShader, vertShaderSource)
    gl.compileShader(vertShader)
    detectShaderError(gl, vertShader)
    gl.attachShader(program, vertShader)

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fragShader, fragShaderSource)
    gl.compileShader(fragShader)
    detectShaderError(gl, fragShader)
    gl.attachShader(program, fragShader)

    gl.linkProgram(program)
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS)
    if (!linked) {
        // something went wrong with the link
        const lastError = gl.getProgramInfoLog(program)
        console.error(`Error in program linking:${lastError}`)

        gl.deleteProgram(program)
        return null
    }
    return program
}

const setRectangle = (gl, x, y, width, height) => {
    const x1 = x
    const x2 = x + width
    const y1 = y
    const y2 = y + height
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2,
    ]), gl.STATIC_DRAW)
}

export default TileRenderer
