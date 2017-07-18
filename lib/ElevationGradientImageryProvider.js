"use strict";
 
var Cartographic = require('cesium/Source/Core/Cartographic');
var Color = require('cesium/Source/Core/Color');
var Credit = require('cesium/Source/Core/Credit');
var defaultValue = require('cesium/Source/Core/defaultValue');
var defined = require('cesium/Source/Core/defined');
var defineProperties = require('cesium/Source/Core/defineProperties');
var DeveloperError = require('cesium/Source/Core/DeveloperError');
var EllipsoidGeodesic = require('cesium/Source/Core/EllipsoidGeodesic');
var Event = require('cesium/Source/Core/Event'); // jshint ignore:line
var GeographicTilingScheme = require('cesium/Source/Core/GeographicTilingScheme');
var Rectangle = require('cesium/Source/Core/Rectangle');

var TileRenderer = require('./TileRenderer');

const defaultMaskSampler = cartographics => Promise.resolve(cartographics.map(() => 1.0))

/**
 * An imagery provider that samples terrain to provide various visualisation options.
 *
 * @author Propeller Aerobotics
 *
 * @param {Object} options Object with the following properties:
 * @param {Number} [options.minimumTileLevel] Control the usage of blank tiles for coarse levels.
 * @param {Number} [options.gradientMinElevation] The starting point for the elevation gradient.
 * @param {Number} [options.gradientMaxElevation] The finishing point for the elevation gradient.
 * @param {Number} [options.majorContour] The elevation spacing of major contour lines.
 * @param {Number} [options.minorContour] The elevation spacing of minor contour lines.
 * @param {Credit|String} [options.credit] The credit, which will is displayed on the canvas.
 *
 */
var ElevationGradientImageryProvider = function ElevationGradientImageryProvider(options) {
    options = defaultValue(options, defaultValue.EMPTY_OBJECT);

    this.valueSampler = options.valueSampler;
    this.maskSampler = options.maskSampler || defaultMaskSampler

    this._tilingScheme = defined(options.tilingScheme) ? options.tilingScheme : new GeographicTilingScheme({ ellipsoid: options.ellipsoid });
    this._color = defaultValue(options.color, Color.RED);
    this._errorEvent = new Event();

    // Render resolution
    this._tileWidth = defaultValue(options.tileWidth, 256);
    this._tileHeight = defaultValue(options.tileHeight, 256);

    this._maskWidth = defaultValue(options.maskWidth, 256);
    this._maskHeight = defaultValue(options.maskHeight, 256);

    // Terrain sampling resolution
    this._gridWidth = defaultValue(options.gridWidth, 65);
    this._gridHeight = defaultValue(options.gridHeight, 65);

    this._minimumTileLevel = defaultValue(options.minimumTileLevel, 13);

    this._gradientMinElevation = defaultValue(options.gradientMinElevation, 0);
    this._gradientMaxElevation = defaultValue(options.gradientMaxElevation, 100);
    this._opacityMinElevation = defaultValue(options.opacityMinElevation, 0);

    this._majorContour = defaultValue(options.majorContour, 10);
    this._minorContour = defaultValue(options.minorContour, 1);

    this._gradOpacity = defaultValue(options.gradOpacity, 1);

    var credit = defaultValue(options.credit, "© Propeller Aerobotics");

    if (typeof credit === 'string') {
        credit = new Credit(credit);
    }
    this._credit = credit;

    this._tileRenderer = new TileRenderer({
        width: this._tileWidth,
        height: this._tileHeight,
        gradient: options.gradient,
    });

    this._blankCanvas = makeBlankCanvas(this._tileWidth);
    this._extent = options.extent;
};

defineProperties(ElevationGradientImageryProvider.prototype, {

    proxy: {
        get: function () {
            return undefined;
        }
    },

    tileWidth: {
        get: function () {
            return this._tileWidth;
        }
    },

    tileHeight: {
        get: function () {
            return this._tileHeight;
        }
    },

    maximumLevel: {
        get: function () {
            return undefined;
        }
    },

    minimumLevel: {
        get: function () {
            return undefined;
        }
    },

    tilingScheme: {
        get: function () {
            return this._tilingScheme;
        }
    },

    rectangle: {
        get: function () {
            return this._tilingScheme.rectangle;
        }
    },

    tileDiscardPolicy: {
        get: function () {
            return undefined;
        }
    },

    errorEvent: {
        get: function () {
            return this._errorEvent;
        }
    },

    ready: {
        get: function () {
            return true;
        }
    },

    credit: {
        get: function () {
            return this._credit;
        }
    },

    hasAlphaChannel: {
        get: function () {
            return true;
        }
    }
});

ElevationGradientImageryProvider.prototype.getTileCredits = function () {
    return this._credit;
};

function rectangleToCartographicGrid(rectangle, divisionsX, divisionsY) {
    var result = new Array(divisionsX * divisionsY);
    var i = 0;
    for (var y = 0; y < divisionsY; ++y) {
        for (var x = 0; x < divisionsX; ++x) {
            var nx = x / (divisionsX - 1);
            var ny = 1.0 - y / (divisionsY - 1);

            var longitude = (1.0 - nx) * rectangle.west + nx * rectangle.east;
            var latitude = (1.0 - ny) * rectangle.south + ny * rectangle.north;

            result[i++] = new Cartographic(longitude, latitude);
        }
    }
    return result;
}

function getRectangleGeodesicSize(r) {

    var northEast = Rectangle.northeast(r);
    var northWest = Rectangle.northwest(r);
    var southWest = Rectangle.southwest(r);

    var widthGeodesic = new EllipsoidGeodesic(northWest, northEast);
    var heightGeodesic = new EllipsoidGeodesic(southWest, northWest);

    return {
        x: widthGeodesic.surfaceDistance,
        y: heightGeodesic.surfaceDistance
    };
}

function heightsFromTileGeo(tileGeo) {
    var heightOffset = tileGeo._structure.heightOffset;
    var heightScale = tileGeo._structure.heightScale;

    var result = new Array(tileGeo._buffer.length);
    tileGeo._buffer.forEach(function (e, i) {
        result[i] = e * heightScale + heightOffset;
    });

    return result;
}

function makeBlankCanvas(width) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = width;
    return canvas;
}

ElevationGradientImageryProvider.prototype.requestImage = function (x, y, tileLevel) {

    if (tileLevel < this._minimumTileLevel) {
        return this._blankCanvas;
    }

    var gridWidth = this._gridWidth;
    var gridHeight = this._gridWidth;

    var rectangle = this._tilingScheme.tileXYToRectangle(x, y, tileLevel);

    if(!Rectangle.intersection(rectangle, this._extent)){
        return this._blankCanvas;
    }

    var tileDimension = getRectangleGeodesicSize(rectangle);

    var renderer = this._tileRenderer;

    var that = this;

    const valueSampleLocations = rectangleToCartographicGrid(rectangle, gridWidth, gridHeight);
    const maskSampleLocations = rectangleToCartographicGrid(rectangle, this._maskWidth, this._maskHeight);

    return this.maskSampler(maskSampleLocations).then(maskSamples => {

        return that.valueSampler(valueSampleLocations, tileLevel).then(function (valueSampleLocations) {
            var valueSamples = valueSampleLocations.map(cartographic => cartographic.height)
            return renderer.render(
                valueSamples,
                maskSamples,
                gridWidth,
                that._maskWidth,
                tileDimension,
                that._gradientMinElevation,
                that._gradientMaxElevation,
                that._opacityMinElevation,
                that._majorContour,
                that._minorContour,
                that._gradOpacity
            );

        }).otherwise(function () {
            return;
        });
    })
};

ElevationGradientImageryProvider.prototype.pickFeatures = function () {
    return undefined;
};

module.exports = ElevationGradientImageryProvider;
