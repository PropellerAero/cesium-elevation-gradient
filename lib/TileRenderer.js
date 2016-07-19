"use strict";

var _ = require('lodash');
var glslify = require('glslify');

var elevationGradientVert = glslify('./shaders/elevationGradientVert.glsl');
var elevationGradientFrag = glslify('./shaders/elevationGradientFrag.glsl');

var Z_FACTOR = 0.75;
var ZENITH = 0.7857142857;
var AZIMUTH = 2.3571428571;

var TileRenderer = function(options) {
    this._canvas = document.createElement('canvas');

    var canvas = this._canvas;
    canvas.width = options.width;
    canvas.height = options.height;

    this._gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!this._gl) {
        alert("Failed to get WebGL context");
    }
};

function cloneCanvas(oldCanvas) {

    //create a new canvas
    var newCanvas = document.createElement('canvas');
    var context = newCanvas.getContext('2d');

    //set dimensions
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;

    //apply the old canvas to the new one
    context.drawImage(oldCanvas, 0, 0);

    //return the new canvas
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
    //shaders.forEach(function(shaderSource) {
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
    //});

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

TileRenderer.prototype.render = function(heights, gridDim, tileDimension, terrainMinElevation, terrainMaxElevation) {
    var gl = this._gl;
    var canvas = this._canvas;

    var elevationBuffer = new ArrayBuffer(heights.length * 4);
    var elevations = new Uint8Array(elevationBuffer);

    var minElevation = _.min(heights);
    var maxElevation = _.max(heights);
    var deltaElevation = maxElevation - minElevation;

    //console.log('elevation range: ',minElevation, maxElevation);

    heights.forEach(function(elevation, i) {
        var n = deltaElevation < 0.001 ? 0 : (elevation - minElevation) / (maxElevation - minElevation);
        var value = n * 255;

        // Note: this is incorrect but reduces visual artefacts
        var floorValue = Math.floor(value);
        var frac = value - floorValue;
        var fracValue = frac * 255;

        //console.log(elevation, value)
        //storeEncodedUint(value, elevations, i);
        elevations[i * 4] = value;
        elevations[i * 4 + 1] = fracValue;
        elevations[i * 4 + 2] = value + 0.5;
        elevations[i * 4 + 3] = value + 0.75;
    });

    // setup GLSL program
    var program = createProgram(gl, elevationGradientVert, elevationGradientFrag);
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
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Upload the image into the texture.
    //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, elevations);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridDim, gridDim, 0, gl.RGBA,
        gl.UNSIGNED_BYTE, elevations);
    //gl.generateMipmap(gl.TEXTURE_2D);

    // Set appropriate uniform
    var setUniformF = function() {
        var type = arguments.length - 1;
        var location = gl.getUniformLocation(program, arguments[0]);
        switch (type) {
            case 1:
                gl.uniform1f(location, arguments[1]);
                break;
            case 2:
                gl.uniform2f(location, arguments[1], arguments[2]);
                break;
        }
    };

    setUniformF("u_resolution", canvas.width, canvas.height);
    setUniformF("u_tileElevationRange", minElevation, maxElevation);
    setUniformF("u_terrainElevationRange", terrainMinElevation, terrainMaxElevation);
    setUniformF("u_textureSize", canvas.width, canvas.height);
    setUniformF("u_tileDimension", tileDimension.x, tileDimension.y);
    setUniformF("u_zFactor", Z_FACTOR);
    setUniformF("u_zenith", ZENITH);
    setUniformF("u_azimuth", AZIMUTH);

    // Create a buffer for the position of the rectangle corners.
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

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
