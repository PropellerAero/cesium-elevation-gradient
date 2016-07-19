cesium-elevation-gradient
=========================

<img src="https://cloud.githubusercontent.com/assets/484870/16941251/53f82342-4dd2-11e6-962b-444d27e11024.jpg" width="535">

An elevation visualiser for [Cesium](https://cesiumjs.org/) acting as an imagery provider.  Elevation samples from a terrain provider are passed to a 2D WebGL renderer.  The renderer then applies a combination of the following algorithms:

* Colour ramp
* Hillshade
* Contour lines

This imagery provider is a contribution to the Cesium community by [Propeller Aerobotics](https://www.propelleraero.com/) and is licensed under the same license as Cesium (Apache 2.0).

View the [live demo](https://propelleraero.github.io/cesium-elevation-gradient/).

Up and running
--------------
Run a test app with a local server

```
npm install
npm start
```
