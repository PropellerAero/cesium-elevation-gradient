"use strict";

var _ = require('lodash')

var elevationGradientVert = require('./shaders/elevationGradientVert.glsl');
var elevationGradientFrag = require('./shaders/elevationGradientFrag.glsl');

var Z_FACTOR = 0.75;
var ZENITH = 0.7857142857;
var AZIMUTH = 2.3571428571;

function minValue(ar) {
    return Math.min.apply(null, ar)
}

function maxValue(ar) {
    return Math.max.apply(null, ar)
}

var TileRenderer = function (options) {
    this._canvas = document.createElement('canvas');

    var canvas = this._canvas;
    canvas.width = options.width;
    canvas.height = options.height;

    this._gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!this._gl) {
        alert("Failed to get WebGL context");
    }

    this._gradient = options.gradient;

    const modifiedFragmentShader = elevationGradientFrag.replace(/GRADIENT_STOP_COUNT/g, this._gradient.length.toString())

    this._program = createProgram(this._gl, elevationGradientVert, modifiedFragmentShader);
};

function cloneCanvas(oldCanvas) {

    var newCanvas = document.createElement('canvas');
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;

    var context = newCanvas.getContext('2d');
    context.drawImage(oldCanvas, 0, 0);

    return newCanvas;
}

function detectShaderError(gl, shader) {
    var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!compiled) {
        var lastError = gl.getShaderInfoLog(shader);
        console.error("*** Error compiling shader '" + shader + "':" + lastError);
    }
}

function createProgram(gl, vertShaderSource, fragShaderSource) {
    var program = gl.createProgram();

    var vertShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertShader, vertShaderSource);
    gl.compileShader(vertShader);
    detectShaderError(gl, vertShader);
    gl.attachShader(program, vertShader);

    var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShader, fragShaderSource);
    gl.compileShader(fragShader);
    detectShaderError(gl, fragShader);
    gl.attachShader(program, fragShader);

    gl.linkProgram(program);
    var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
        // something went wrong with the link
        var lastError = gl.getProgramInfoLog(program);
        console.error("Error in program linking:" + lastError);

        gl.deleteProgram(program);
        return null;
    }
    return program;
}

TileRenderer.prototype.render = function (heights, maskSamples, gridDim, maskDim, tileDimension, gradientMinElevation, gradientMaxElevation, opacityMinElevation, majorContour, minorContour, gradOpacity) {
    var gl = this._gl;
    var canvas = this._canvas;
    var program = this._program;

    var maskBuffer = new ArrayBuffer(maskSamples.length);
    var mask = new Uint8Array(maskBuffer)
    maskSamples.forEach((maskSample, i) => {
        mask[i] = maskSample * 255
    })

    var elevationBuffer = new ArrayBuffer(heights.length * 4);
    var elevations = new Uint8Array(elevationBuffer);

    var minElevation = minValue(heights);
    var maxElevation = maxValue(heights);
    var deltaElevation = maxElevation - minElevation;

    heights.forEach(function (elevation, i) {
        var n = deltaElevation < 0.001 ? 0 : (elevation - minElevation) / (maxElevation - minElevation);
        var value = n * 255;

        // Note: this is incorrect but reduces visual artefacts
        var floorValue = Math.floor(value);
        var frac = value - floorValue;
        var fracValue = frac * 255;

        elevations[i * 4] = value;
        elevations[i * 4 + 1] = fracValue;
        elevations[i * 4 + 2] = value + 0.5;
        elevations[i * 4 + 3] = value + 0.75;
    });

    // setup GLSL program
    gl.useProgram(program);

    // look up where the vertex data needs to go.
    var positionLocation = gl.getAttribLocation(program, "a_position");
    var texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

    // offset by half a pixel
    var textureCoordinateOffset = 0.5 / (gridDim - 1);
    var minUV = textureCoordinateOffset;
    var maxUV = 1.0 - textureCoordinateOffset;

    // provide texture coordinates for the rectangle.
    var texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        minUV, minUV,
        maxUV, minUV,
        minUV, maxUV,
        minUV, maxUV,
        maxUV, minUV,
        maxUV, maxUV
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);




    // Create a texture.
    var elevationTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, elevationTexture);

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Upload the image into the texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridDim, gridDim, 0, gl.RGBA, gl.UNSIGNED_BYTE, elevations);


    // Create a texture.
    var maskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Upload the image into the texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, maskDim, maskDim, 0, gl.ALPHA, gl.UNSIGNED_BYTE, mask);





    

    //gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, gridDim, gridDim, 0, gl.RGBA,
    //    gl.UNSIGNED_BYTE, mask);

    // Set appropriate uniform
    var setUniformF = function () {
        var type = arguments.length - 1;
        var location = gl.getUniformLocation(program, arguments[0]);
        switch (type) {
            case 1:
                gl.uniform1f(location, arguments[1]);
                break;
            case 2:
                gl.uniform2f(location, arguments[1], arguments[2]);
                break;
            case 3:
                gl.uniform3f(location, arguments[1], arguments[2], arguments[3]);
                break;
        }
    };

    setUniformF("u_resolution", canvas.width, canvas.height);
    setUniformF("u_tileElevationRange", minElevation, maxElevation);
    setUniformF("u_elevationRange", gradientMinElevation, gradientMaxElevation, opacityMinElevation);
    setUniformF("u_textureSize", canvas.width, canvas.height);
    setUniformF("u_tileDimension", tileDimension.x, tileDimension.y);
    setUniformF("u_zFactor", Z_FACTOR);
    setUniformF("u_zenith", ZENITH);
    setUniformF("u_azimuth", AZIMUTH);
    setUniformF("u_majorContour", majorContour);
    setUniformF("u_minorContour", minorContour);
    setUniformF("u_gradOpacity", gradOpacity);

    const gradient = this._gradient
    const gradientColors = []
    gradient.forEach(x => {
        gradientColors.push(x.r);
        gradientColors.push(x.g);
        gradientColors.push(x.b);
        gradientColors.push(x.a);
    });
    const gradientHeights = gradient.map(x => x.z)

    var gradientColorLocation = gl.getUniformLocation(program, 'u_gradientColors');
    gl.uniform4fv(gradientColorLocation, new Float32Array(gradientColors));
    var gradientHeightLocation = gl.getUniformLocation(program, 'u_gradientHeights');
    gl.uniform1fv(gradientHeightLocation, new Float32Array(gradientHeights));

    // Create a buffer for the position of the rectangle corners.
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);


    // lookup the sampler locations.
    var u_image0Location = gl.getUniformLocation(program, "u_image");
    var u_image1Location = gl.getUniformLocation(program, "u_mask");

    // set which texture units to render with.
    gl.uniform1i(u_image0Location, 0);  // texture unit 0
    gl.uniform1i(u_image1Location, 1);  // texture unit 1



    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, elevationTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);


    // Set a rectangle the same size as the image.
    setRectangle(gl, 0, 0, canvas.width, canvas.height);

    // Draw the rectangle.
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return cloneCanvas(this._canvas);
};

function setRectangle(gl, x, y, width, height) {
    var x1 = x;
    var x2 = x + width;
    var y1 = y;
    var y2 = y + height;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2
    ]), gl.STATIC_DRAW);
}

module.exports = TileRenderer;
