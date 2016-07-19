"use strict";

var Cartographic = require('cesium/Source/Core/Cartographic');
var Color = require('cesium/Source/Core/Color');
var Credit = require('cesium/Source/Core/Credit');
var defaultValue = require('cesium/Source/Core/defaultValue');
var defined = require('cesium/Source/Core/defined');
var defineProperties = require('cesium/Source/Core/defineProperties');
var DeveloperError = require('cesium/Source/Core/DeveloperError');
var EllipsoidGeodesic = require('cesium/Source/Core/EllipsoidGeodesic');
var Event = require('cesium/Source/Core/Event');
var GeographicTilingScheme = require('cesium/Source/Core/GeographicTilingScheme');
var Rectangle = require('cesium/Source/Core/Rectangle');
var sampleTerrain = require('cesium/Source/Core/sampleTerrain');

var TileRenderer = require('./TileRenderer');

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
    this._blankCanvas = makeBlankCanvas(this._tileWidth);

    // Terrain sampling resolution
    this._gridWidth = defaultValue(options.gridWidth, 65);
    this._gridHeight = defaultValue(options.gridHeight, 65);

    this._minimumLevel = defaultValue(options.minimumLevel, 10);
    var credit = defaultValue(options.credit, "© Propeller Aerobotics");

    if (typeof credit === 'string') {
        credit = new Credit(credit);
    }
    this._credit = credit;

    if (!defined(options.minElevation)) {
        throw new DeveloperError('minElevation argument required');
    }
    if (!defined(options.maxElevation)) {
        throw new DeveloperError('maxElevation argument required');
    }
    this._minElevation = options.minElevation;
    this._maxElevation = options.maxElevation;

    this._tileRenderer = new TileRenderer({ width: this._tileWidth, height: this._tileHeight });
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

ElevationGradientImageryProvider.prototype.getTileCredits = function(x, y, level) {
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

ElevationGradientImageryProvider.prototype.requestImage = function(x, y, level) {

    if (level < this._minimumLevel) {
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
            return renderer.render(heights, tileGeo._width, tileDimension, that._minElevation, that._maxElevation);

        }).otherwise(function() {

            // Use Cesium's sampleTerrain as a fallback for missing tiles
            var tileGrid = rectangleToCartographicGrid(rectangle, gridWidth, gridHeight);

            // Current tile level has failed so start at one level coarser
            var oneLevelUp = Math.min(Math.max(level - 1, 1), mostDetailedLevel);

            return that._terrainSampler(terrainProvider, oneLevelUp, tileGrid).then(function() {
                var heights = tileGrid.map(function(c) {
                    return c.height;
                });
                return renderer.render(heights, gridWidth, tileDimension, that._minElevation, that._maxElevation);
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
