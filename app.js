import 'cesium/Source/Widgets/widgets.css';

import BuildModuleUrl from 'cesium/Source/Core/buildModuleUrl';
import Cartesian3 from 'cesium/Source/Core/Cartesian3';
import CesiumMath from 'cesium/Source/Core/Math';
import CesiumTerrainProvider from 'cesium/Source/Core/CesiumTerrainProvider';
import Matrix4 from 'cesium/Source/Core/Matrix4';
import ScreenSpaceEventHandler from 'cesium/Source/Core/ScreenSpaceEventHandler';
import ScreenSpaceEventType from 'cesium/Source/Core/ScreenSpaceEventType';
import Viewer from 'cesium/Source/Widgets/Viewer/Viewer';
import {WGS84} from 'cesium/Source/Core/Ellipsoid';
import ElevationGradient from './lib/ElevationGradientImageryProvider';

BuildModuleUrl.setBaseUrl('./');

const viewer = new Viewer('cesiumContainer');

const setUpTerrain = (viewer) => {
    const cesiumTerrainProviderMeshes = new CesiumTerrainProvider({
        url: 'https://assets.agi.com/stk-terrain/world',
        requestWaterMask: false,
        requestVertexNormals: true
    });

    viewer.terrainProvider = cesiumTerrainProviderMeshes;
}

const setUpElevationGradient = (viewer) => {
    const terrainProvider = viewer.terrainProvider;
    const scene = viewer.scene;

    const imageryLayer = scene.imageryLayers.addImageryProvider(new ElevationGradient({
        terrainProvider,
        gradientMinElevation: 500,
        gradientMaxElevation: 1000,
        opacityMinElevation: 650,
        majorContour: 25,
        minorContour: 5
    }));

    // You can control overall layer opacity here...
    imageryLayer.alpha = 1.0;
}

const initCameraLocation = (viewer) => {
    const target = Cartesian3.fromDegrees(130.7359, -25.2990);
    const offset = new Cartesian3(1500, 1500, 3000);
    viewer.camera.lookAt(target, offset);
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

const setUpMouseInfo = (viewer) => {
    const scene = viewer.scene;
    const globe = scene.globe;

    const entity = viewer.entities.add({
        label: {
            font: '14px sans-serif',
            show: false
        }
    });

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(movement => {

        const ray = viewer.camera.getPickRay(movement.endPosition);

        const cartesian = globe.pick(ray, scene);
        if (cartesian) {
            const cartographic = WGS84.cartesianToCartographic(cartesian);
            const longitudeString = CesiumMath.toDegrees(cartographic.longitude).toFixed(4);
            const latitudeString = CesiumMath.toDegrees(cartographic.latitude).toFixed(4);
            const heightString = cartographic.height.toFixed(2);

            entity.position = cartesian;
            entity.label.show = true;
            entity.label.text = `(${longitudeString}, ${latitudeString}, ${heightString})`;
        } else {
            entity.label.show = false;
        }
    }, ScreenSpaceEventType.MOUSE_MOVE);
}

setUpTerrain(viewer);
setUpElevationGradient(viewer);
initCameraLocation(viewer);
setUpMouseInfo(viewer);
