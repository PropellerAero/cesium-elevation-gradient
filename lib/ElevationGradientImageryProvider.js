import Cartographic from 'cesium/Source/Core/Cartographic';
import Color from 'cesium/Source/Core/Color';
import Credit from 'cesium/Source/Core/Credit';
import defaultValue from 'cesium/Source/Core/defaultValue';
import defined from 'cesium/Source/Core/defined';
import defineProperties from 'cesium/Source/Core/defineProperties';
import DeveloperError from 'cesium/Source/Core/DeveloperError';
import EllipsoidGeodesic from 'cesium/Source/Core/EllipsoidGeodesic';
import Event from 'cesium/Source/Core/Event'; // jshint ignore:line
import GeographicTilingScheme from 'cesium/Source/Core/GeographicTilingScheme';
import Rectangle from 'cesium/Source/Core/Rectangle';
import TileRenderer from './TileRenderer';
import { range } from 'lodash'

const DEFAULT_TILE_SIZE = 256;
const DEFAULT_TERRAIN_TILE_SIZE = 65;
const MINIMUM_TILE_LEVEL = 13;
const GRADIENT_MIN_ELEVATION = 0;
const GRADIENT_MAX_ELEVATION = 100;
const OPACITY_MIN_ELEVATION = 0;
const MAJOR_CONTOUR = 10;
const MINOR_CONTOUR = 0;
const GRAD_OPACITY = 1;
const CREDIT = '© Propeller Aerobotics';

const defaultMaskSampler = cartographics => Promise.resolve(cartographics.map(() => 1.0))

/**
 * An imagery provider that samples terrain to provide various visualisation options.
 *
 * @author Propeller Aerobotics
 *
 * @param {Object} options Object with the following properties:
 * @param {Function} [options.valueSampler] 
 * @param {Function} [options.maskSampler] 
 * @param {Object} [options.tilingScheme] 
 * @param {Number} [options.ellipsoid] 
 * @param {Number} [options.tileSize] 
 * @param {Number} [options.gridSize] 
 * @param {Number} [options.minimumTileLevel] 
 * @param {Number} [options.gradientMinElevation] The starting point for the elevation gradient.
 * @param {Number} [options.gradientMaxElevation] The finishing point for the elevation gradient.
 * @param {Number} [options.majorContour] The elevation spacing of major contour lines.
 * @param {Number} [options.minorContour] The elevation spacing of minor contour lines.
 * @param {Number} [options.gradOpacity] 
 * @param {Credit|String} [options.credit] The credit, which will is displayed on the canvas.
 * @param {Number} [options.extent] 
 * @param {Array<Object>} [options.gradient] 
 *
 */
class ElevationGradientImageryProvider {
    constructor({
            valueSampler,
            maskSampler = defaultMaskSampler,
            tilingScheme,
            ellipsoid,
            color = Color.RED,
            tileSize = DEFAULT_TILE_SIZE,
            gridSize = DEFAULT_TERRAIN_TILE_SIZE,
            minimumTileLevel = MINIMUM_TILE_LEVEL,
            gradientMinElevation = GRADIENT_MIN_ELEVATION,
            gradientMaxElevation = GRADIENT_MAX_ELEVATION,
            opacityMinElevation = OPACITY_MIN_ELEVATION,
            majorContour = MAJOR_CONTOUR,
            minorContour = MINOR_CONTOUR,
            gradOpacity = GRAD_OPACITY,
            credit = CREDIT,
            extent,
            gradient
        }) {

        this.valueSampler = valueSampler;
        this.maskSampler = maskSampler;

        this.tilingScheme = tilingScheme ? tilingScheme : new GeographicTilingScheme({ ellipsoid });
        this.color = color;
        this.errorEvent = new Event();

        // Render resolution
        this.tileSize = tileSize;
        this.maskSize = tileSize;
        this.gridSize = gridSize;

        this.minimumTileLevel = minimumTileLevel;

        this.gradientMinElevation = gradientMinElevation;
        this.gradientMaxElevation = gradientMaxElevation;
        this.opacityMinElevation = opacityMinElevation;

        this.majorContour = majorContour;
        this.minorContour = minorContour;

        this.gradOpacity = gradOpacity;

        this.credit = typeof(credit === 'string') ? new Credit(credit) : credit;

        this.tileRenderer = new TileRenderer({
            width: this.tileSize,
            height: this.tileSize,
            gradient
        });

        this.blankCanvas = makeBlankCanvas(this.tileSize);
        this.extent = extent;
    }

    getTileCredits() {
        return this.credit;
    }

    requestImage = (x, y, tileLevel) => {
        
        if (tileLevel < this.minimumTileLevel) {
            return this.blankCanvas;
        }

        const gridSize = this.gridSize;

        const rectangle = this.tilingScheme.tileXYToRectangle(x, y, tileLevel);

        if(!Rectangle.intersection(rectangle, this.extent)){
            return this.blankCanvas;
        }

        const tileDimension = getRectangleGeodesicSize(rectangle);

        const renderer = this.tileRenderer;

        const valueSampleLocations = rectangleToCartographicGrid(rectangle, gridSize, gridSize);
        const maskSampleLocations = rectangleToCartographicGrid(rectangle, this.maskSize, this.maskSize);

        return this.maskSampler(maskSampleLocations).then(maskSamples => {
            return this.valueSampler(valueSampleLocations, tileLevel).then(valueSampleLocations => {
                const valueSamples = valueSampleLocations.map(cartographic => cartographic.height);
                return renderer.render(
                    valueSamples,
                    maskSamples,
                    gridSize,
                    that.maskSize,
                    tileDimension,
                    that.gradientMinElevation,
                    that.gradientMaxElevation,
                    that.opacityMinElevation,
                    that.majorContour,
                    that.minorContour,
                    that.gradOpacity
                );

            }).otherwise(() => {
                return;
            });
        })
    }

    pickFeatures() {
        return undefined;
    }

    get tileWidth() {        
        return this.tileSize;
    }

    get tileHeight() {        
        return this.tileSize;
    }

    get maximumLevel() {        
        return undefined;
    }

    get minimumLevel() {        
        return undefined;
    }

    get rectangle() {        
        return this.tilingScheme.rectangle;
    }

    get tileDiscardPolicy() {        
        return undefined;
    }

    get ready() {        
        return true;
    }

    get hasAlphaChannel() {        
        return true;
    }    
}

const rectangleToCartographicGrid = (rectangle, divisionsX, divisionsY) => {
    return range(dimensionX * dimensionY).map(i => { 
        const x = i % dimensionX;
        const y = Math.floor(i / dimensionX);

        const nx = x / (divisionsX - 1);
        const ny = 1.0 - y / (divisionsY - 1);

        const longitude = (1.0 - nx) * rectangle.west + nx * rectangle.east;
        const latitude = (1.0 - ny) * rectangle.south + ny * rectangle.north;
        
        return new Cartographic(longitude, latitude);        
    });
}

const getRectangleGeodesicSize = (r) => {

    const northEast = Rectangle.northeast(r);
    const northWest = Rectangle.northwest(r);
    const southWest = Rectangle.southwest(r);

    const widthGeodesic = new EllipsoidGeodesic(northWest, northEast);
    const heightGeodesic = new EllipsoidGeodesic(southWest, northWest);

    return {
        x: widthGeodesic.surfaceDistance,
        y: heightGeodesic.surfaceDistance
    };
}

const heightsFromTileGeo = (tileGeo) => {
    const heightOffset = tileGeo._structure.heightOffset;
    const heightScale = tileGeo._structure.heightScale;

    const result = new Array(tileGeo._buffer.length);
    tileGeo._buffer.forEach((e, i) => {
        result[i] = e * heightScale + heightOffset;
    });

    return result;
}

const makeBlankCanvas = (size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
}

export default ElevationGradientImageryProvider;
