"use strict";

/* global require */

var Cartographic = require('cesium/Source/Core/Cartographic');
var Color = require('cesium/Source/Core/Color');
var defaultValue = require('cesium/Source/Core/defaultValue');
var defined = require('cesium/Source/Core/defined');
var defineProperties = require('cesium/Source/Core/defineProperties');
var DeveloperError = require('cesium/Source/Core/DeveloperError');
var EllipsoidGeodesic = require('cesium/Source/Core/EllipsoidGeodesic');
var Event = require('cesium/Source/Core/Event');
var GeographicTilingScheme = require('cesium/Source/Core/GeographicTilingScheme');
var Rectangle = require('cesium/Source/Core/Rectangle');
var sampleTerrain = require('cesium/Source/Core/sampleTerrain');
var when = require('cesium/Source/ThirdParty/when');

var TileRenderer = require('./TileRenderer');

var ElevationGradientImageryProvider = function ElevationGradientImageryProvider(options) {
    options = defaultValue(options, defaultValue.EMPTY_OBJECT);

    if (!defined(options.terrainProvider)) {
        throw new DeveloperError('terrainProvider argument required');
    }
    this._terrainProvider = options.terrainProvider;
    this._terrainSampler = defaultValue(options.terrainSampler, sampleTerrain);
    console.log("terrain sampler: ", this._terrainSampler)

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
    /**
     * Gets the proxy used by this provider.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Proxy}
     * @readonly
     */
    proxy: {
        get: function() {
            return undefined;
        }
    },

    /**
     * Gets the width of each tile, in pixels. This function should
     * not be called before {@link ElevationGradientImageryProvider#ready} returns true.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    tileWidth: {
        get: function() {
            return this._tileWidth;
        }
    },

    /**
     * Gets the height of each tile, in pixels.  This function should
     * not be called before {@link ElevationGradientImageryProvider#ready} returns true.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    tileHeight: {
        get: function() {
            return this._tileHeight;
        }
    },

    /**
     * Gets the maximum level-of-detail that can be requested.  This function should
     * not be called before {@link ElevationGradientImageryProvider#ready} returns true.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    maximumLevel: {
        get: function() {
            return undefined;
        }
    },

    /**
     * Gets the minimum level-of-detail that can be requested.  This function should
     * not be called before {@link ElevationGradientImageryProvider#ready} returns true.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Number}
     * @readonly
     */
    minimumLevel: {
        get: function() {
            return undefined;
        }
    },

    /**
     * Gets the tiling scheme used by this provider.  This function should
     * not be called before {@link ElevationGradientImageryProvider#ready} returns true.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {TilingScheme}
     * @readonly
     */
    tilingScheme: {
        get: function() {
            return this._tilingScheme;
        }
    },

    /**
     * Gets the rectangle, in radians, of the imagery provided by this instance.  This function should
     * not be called before {@link ElevationGradientImageryProvider#ready} returns true.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Rectangle}
     * @readonly
     */
    rectangle: {
        get: function() {
            return this._tilingScheme.rectangle;
        }
    },

    /**
     * Gets the tile discard policy.  If not undefined, the discard policy is responsible
     * for filtering out "missing" tiles via its shouldDiscardImage function.  If this function
     * returns undefined, no tiles are filtered.  This function should
     * not be called before {@link ElevationGradientImageryProvider#ready} returns true.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {TileDiscardPolicy}
     * @readonly
     */
    tileDiscardPolicy: {
        get: function() {
            return undefined;
        }
    },

    /**
     * Gets an event that is raised when the imagery provider encounters an asynchronous error.  By subscribing
     * to the event, you will be notified of the error and can potentially recover from it.  Event listeners
     * are passed an instance of {@link TileProviderError}.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Event}
     * @readonly
     */
    errorEvent: {
        get: function() {
            return this._errorEvent;
        }
    },

    /**
     * Gets a value indicating whether or not the provider is ready for use.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Boolean}
     * @readonly
     */
    ready: {
        get: function() {
            return true;
        }
    },

    /**
     * Gets the credit to display when this imagery provider is active.  Typically this is used to credit
     * the source of the imagery.  This function should not be called before {@link ElevationGradientImageryProvider#ready} returns true.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Credit}
     * @readonly
     */
    credit: {
        get: function() {
            return undefined;
        }
    },

    /**
     * Gets a value indicating whether or not the images provided by this imagery provider
     * include an alpha channel.  If this property is false, an alpha channel, if present, will
     * be ignored.  If this property is true, any images without an alpha channel will be treated
     * as if their alpha is 1.0 everywhere.  Setting this property to false reduces memory usage
     * and texture upload time.
     * @memberof ElevationGradientImageryProvider.prototype
     * @type {Boolean}
     * @readonly
     */
    hasAlphaChannel: {
        get: function() {
            return true;
        }
    }
});

/**
 * Gets the credits to be displayed when a given tile is displayed.
 *
 * @param {Number} x The tile X coordinate.
 * @param {Number} y The tile Y coordinate.
 * @param {Number} level The tile level;
 * @returns {Credit[]} The credits to be displayed when the tile is displayed.
 *
 * @exception {DeveloperError} <code>getTileCredits</code> must not be called before the imagery provider is ready.
 */
ElevationGradientImageryProvider.prototype.getTileCredits = function(x, y, level) {
    return undefined;
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

    if (level < 10) {
        return this._blankCanvas;
    }

    var gridWidth = this._gridWidth;
    var gridHeight = this._gridWidth;

    var rectangle = this._tilingScheme.tileXYToRectangle(x, y, level);

    var tileDimension = getRectangleGeodesicSize(rectangle);

    var renderer = this._tileRenderer;

    var that = this;

    return when(this._terrainProvider.readyPromise).then(function() {
        return that._terrainProvider.requestTileGeometry(x, y, level, false).then(function(tileGeo) {
            console.log("1")

            // Able to get raw data for terrain tile....
            var heights = heightsFromTileGeo(tileGeo);
            return renderer.render(heights, tileGeo._width, tileDimension, that._minElevation, that._maxElevation);

        }).otherwise(function(err) {
            console.log("2")

            // Use Cesium's sampleTerrain as a fallback for missing tiles
            var tileGrid = rectangleToCartographicGrid(rectangle, gridWidth, gridHeight);

            // Current tile level has failed so start at one level coarser
            var oneLevelUp = Math.max(level - 1, 1);

            console.log("terrain sampler 2: ", that._terrainSampler)

            return that._terrainSampler(that._terrainProvider, oneLevelUp, tileGrid).then(function() {
                console.log("got heights for: ", oneLevelUp)
                var heights = tileGrid.map(function(c) {
                    return c.height;
                });
                return renderer.render(heights, gridWidth, tileDimension, that._minElevation, that._maxElevation);
            }).otherwise(function() {
                console.log("3")
                return;
            });
        });
    });

};

/**
 * Picking features is not currently supported by this imagery provider, so this function simply returns
 * undefined.
 *
 * @param {Number} x The tile X coordinate.
 * @param {Number} y The tile Y coordinate.
 * @param {Number} level The tile level.
 * @param {Number} longitude The longitude at which to pick features.
 * @param {Number} latitude  The latitude at which to pick features.
 * @return {Promise.<ImageryLayerFeatureInfo[]>|undefined} A promise for the picked features that will resolve when the asynchronous
 *                   picking completes.  The resolved value is an array of {@link ImageryLayerFeatureInfo}
 *                   instances.  The array may be empty if no features are found at the given location.
 *                   It may also be undefined if picking is not supported.
 */
ElevationGradientImageryProvider.prototype.pickFeatures = function() {
    return undefined;
};

module.exports = ElevationGradientImageryProvider;
