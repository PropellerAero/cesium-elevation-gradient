"use strict";

require('cesium/Source/Widgets/widgets.css');

var BuildModuleUrl = require('cesium/Source/Core/buildModuleUrl');
var Cartesian3 = require('cesium/Source/Core/Cartesian3');
var CesiumMath = require('cesium/Source/Core/Math');
var CesiumTerrainProvider = require('cesium/Source/Core/CesiumTerrainProvider');
var Matrix4 = require('cesium/Source/Core/Matrix4');
var ScreenSpaceEventHandler = require('cesium/Source/Core/ScreenSpaceEventHandler');
var ScreenSpaceEventType = require('cesium/Source/Core/ScreenSpaceEventType');
var Viewer = require('cesium/Source/Widgets/Viewer/Viewer');
var WGS84 = require('cesium/Source/Core/Ellipsoid').WGS84;

var ElevationGradient = require('./lib/ElevationGradientImageryProvider');

BuildModuleUrl.setBaseUrl('./');

var viewer = new Viewer('cesiumContainer');

function setUpTerrain(viewer) {
    var cesiumTerrainProviderMeshes = new CesiumTerrainProvider({
        url: 'https://assets.agi.com/stk-terrain/world',
        requestWaterMask: false,
        requestVertexNormals: true
    });

    viewer.terrainProvider = cesiumTerrainProviderMeshes;
}

function setUpElevationGradient(viewer) {
    var terrainProvider = viewer.terrainProvider;
    var scene = viewer.scene;

    var imageryLayer = scene.imageryLayers.addImageryProvider(new ElevationGradient({
        terrainProvider: terrainProvider,
        minElevation: 0,
        maxElevation: 500,
        majorContour: 25,
        minorContour: 5
    }));

    // You can control overall layer opacity here...
    imageryLayer.alpha = 1.0;
}

function initCameraLocation(viewer) {;
    var target = Cartesian3.fromDegrees(130.7359, -25.2990);
    var offset = new Cartesian3(1700, 1700, 1700);
    viewer.camera.lookAt(target, offset);
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

function setUpMouseInfo(viewer) {
    var scene = viewer.scene;
    var globe = scene.globe;

    var entity = viewer.entities.add({
        label: {
            font: '14px sans-serif',
            show: false
        }
    });

    var handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(function(movement) {

        var ray = viewer.camera.getPickRay(movement.endPosition);

        var cartesian = globe.pick(ray, scene);
        if (cartesian) {
            var cartographic = WGS84.cartesianToCartographic(cartesian);
            var longitudeString = CesiumMath.toDegrees(cartographic.longitude).toFixed(4);
            var latitudeString = CesiumMath.toDegrees(cartographic.latitude).toFixed(4);
            var heightString = cartographic.height.toFixed(2);

            entity.position = cartesian;
            entity.label.show = true;
            entity.label.text = '(' + longitudeString + ', ' + latitudeString + ', ' + heightString + ')';
        } else {
            entity.label.show = false;
        }
    }, ScreenSpaceEventType.MOUSE_MOVE);
}

setUpTerrain(viewer);
setUpElevationGradient(viewer);
initCameraLocation(viewer);
setUpMouseInfo(viewer);
