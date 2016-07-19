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
var sampleTerrain = require('cesium/Source/Core/sampleTerrain');

var TileRenderer = require('./TileRenderer');


/**
 * An imagery provider that samples terrain to provide various visualisation options.
 *
 * @author Propeller Aerobotics
 *
 * @param {Object} options Object with the following properties:
 * @param {Object} options.terrainProvider The terrain provider to sample elevations from.
 * @param {Number} [options.minimumTileLevel] Control the usage of blank tiles for coarse levels.
 * @param {Number} [options.minElevation] The starting point for the elevation gradient.
 * @param {Number} [options.maxElevation] The finishing point for the elevation gradient.
 * @param {Number} [options.majorContour] The elevation spacing of major contour lines.
 * @param {Number} [options.minorContour] The elevation spacing of minor contour lines.
 * @param {Credit|String} [options.credit] The credit, which will is displayed on the canvas.
 *
 */
var ElevationGradientImageryProvider = function ElevationGradientImageryProvider(options) {
    options = defaultValue(options, defaultValue.EMPTY_OBJECT);

    if (!defined(options.terrainProvider)) {
        throw new DeveloperError('terrainProvider argument required');
    }

    this._terrainProvider = options.terrainProvider;
    this._terrainSampler = defaultValue(options.terrainSampler, sampleTerrain);

    this._tilingScheme = defined(options.tilingScheme) ? options.tilingScheme : new GeographicTilingScheme({ ellipsoid: options.ellipsoid });
    this._color = defaultValue(options.color, Color.RED);
    this._errorEvent = new Event();

    // Render resolution
    this._tileWidth = defaultValue(options.tileWidth, 256);
    this._tileHeight = defaultValue(options.tileHeight, 256);

    // Terrain sampling resolution
    this._gridWidth = defaultValue(options.gridWidth, 65);
    this._gridHeight = defaultValue(options.gridHeight, 65);

    this._minimumTileLevel = defaultValue(options.minimumTileLevel, 13);

    this._minElevation = defaultValue(options.minElevation, 0);
    this._maxElevation = defaultValue(options.maxElevation, 100);

    this._majorContour = defaultValue(options.majorContour, 10);
    this._minorContour = defaultValue(options.minorContour, 1);

    this._gradOpacity = defaultValue(options.gradOpacity, 0.5);

    var credit = defaultValue(options.credit, "© Propeller Aerobotics");

    if (typeof credit === 'string') {
        credit = new Credit(credit);
    }
    this._credit = credit;

    this._tileRenderer = new TileRenderer({ width: this._tileWidth, height: this._tileHeight });
    this._blankCanvas = makeBlankCanvas(this._tileWidth);
};

defineProperties(ElevationGradientImageryProvider.prototype, {

    proxy: {
        get: function() {
            return undefined;
        }
    },

    tileWidth: {
        get: function() {
            return this._tileWidth;
        }
    },

    tileHeight: {
        get: function() {
            return this._tileHeight;
        }
    },

    maximumLevel: {
        get: function() {
            return undefined;
        }
    },

    minimumLevel: {
        get: function() {
            return undefined;
        }
    },

    tilingScheme: {
        get: function() {
            return this._tilingScheme;
        }
    },

    rectangle: {
        get: function() {
            return this._tilingScheme.rectangle;
        }
    },

    tileDiscardPolicy: {
        get: function() {
            return undefined;
        }
    },

    errorEvent: {
        get: function() {
            return this._errorEvent;
        }
    },

    ready: {
        get: function() {
            return this._terrainProvider._ready;
        }
    },

    credit: {
        get: function() {
            return this._credit;
        }
    },

    hasAlphaChannel: {
        get: function() {
            return true;
        }
    }
});

ElevationGradientImageryProvider.prototype.getTileCredits = function() {
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
    tileGeo._buffer.forEach(function(e, i) {
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

function mostDetailedTerrainLevel(cartographic, terrainProvider) {

    var tilingScheme = terrainProvider.tilingScheme;
    var tiles = terrainProvider._availableTiles;

    if (!defined(tiles)) {
        return 0;
    }

    for (var level = tiles.length - 1; level >= 0; level--) {
        var xy = tilingScheme.positionToTileXY(cartographic, level);
        if (defined(xy)) {
            if (terrainProvider.getTileDataAvailable(xy.x, xy.y, level)) {
                return level;
            }
        }
    }

    return 0;
}

ElevationGradientImageryProvider.prototype.requestImage = function(x, y, level) {

    if (level < this._minimumTileLevel) {
        return this._blankCanvas;
    }

    var gridWidth = this._gridWidth;
    var gridHeight = this._gridWidth;

    var rectangle = this._tilingScheme.tileXYToRectangle(x, y, level);

    var tileDimension = getRectangleGeodesicSize(rectangle);

    var renderer = this._tileRenderer;

    var that = this;
    var terrainProvider = this._terrainProvider;

    return terrainProvider.readyPromise.then(function() {

        var mostDetailedLevel = mostDetailedTerrainLevel(Rectangle.center(rectangle), terrainProvider);

        return terrainProvider.requestTileGeometry(x, y, level, false).then(function(tileGeo) {

            // Able to get raw data for terrain tile....
            var heights = heightsFromTileGeo(tileGeo);
            return renderer.render(
                heights,
                tileGeo._width,
                tileDimension,
                that._minElevation,
                that._maxElevation,
                that._majorContour,
                that._minorContour,
                that._gradOpacity
            );

        }).otherwise(function() {

            // Use Cesium's sampleTerrain as a fallback for missing tiles
            var tileGrid = rectangleToCartographicGrid(rectangle, gridWidth, gridHeight);

            // Limit tile level based on what the terrain provider can supply
            var sampleTileLevel = Math.min(level, mostDetailedLevel);

            return that._terrainSampler(terrainProvider, sampleTileLevel, tileGrid).then(function() {
                var heights = tileGrid.map(function(c) {
                    return c.height;
                });
                return renderer.render(
                    heights,
                    gridWidth,
                    tileDimension,
                    that._minElevation,
                    that._maxElevation,
                    that._majorContour,
                    that._minorContour,
                    that._gradOpacity
                );

            }).otherwise(function() {
                return;
            });
        });
    });
};

ElevationGradientImageryProvider.prototype.pickFeatures = function() {
    return undefined;
};

module.exports = ElevationGradientImageryProvider;
