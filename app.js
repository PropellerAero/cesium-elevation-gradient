import 'cesium/Source/Widgets/widgets.css';

import Cesium from 'cesium/Source/Cesium'
import ElevationGradient from './lib/ElevationGradientImageryProvider'
const {
    Cartesian3,
    CesiumMath,
    CesiumTerrainProvider,
    Ellipsoid,
    Matrix4,
    Rectangle,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    Viewer,
    buildModuleUrl,
    sampleTerrainMostDetailed,
} = Cesium

const { WGS84 } = Ellipsoid

buildModuleUrl.setBaseUrl('./');

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

    const valueSampler = (positions, level) => (
        sampleTerrainMostDetailed(terrainProvider, positions).then(
            (sampledPositions) => sampledPositions.map(position => position.height)
        )
    )
    formatContourLabel: value => `${value.toFixed(2)} m`

    const imageryLayer = scene.imageryLayers.addImageryProvider(new ElevationGradient({
        valueSampler,
        readyPromise: terrainProvider.readyPromise,
        majorContour: 25,
        minorContour: 5,
        gradient: [
            {
                "color": {
                    "red": 0,
                    "green": 0,
                    "blue": 0,
                    "alpha": 0
                },
                "value": 600
            },
            {
                "color": {
                    "red": 0,
                    "green": 0,
                    "blue": 1,
                    "alpha": 0.5
                },
                "value": 600
            },
            {
                "color": {
                    "red": 1,
                    "green": 0,
                    "blue": 0,
                    "alpha": 0.5
                },
                "value": 1000
            },
            {
                "color": {
                    "red": 0,
                    "green": 0,
                    "blue": 0,
                    "alpha": 0
                },
                "value": 1000
            }
        ]
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
