"use strict";

var lofi = false;
var postprocess = true;

var canvasL = document.createElement('canvas');
canvasL.className = "fullSize";
document.getElementById('cesiumContainerLeft').appendChild(canvasL);

var canvasR = document.createElement('canvas');
canvasR.className = "fullSize";
document.getElementById('cesiumContainerRight').appendChild(canvasR);

var canvasCopy = new CanvasCopy(canvasR, false);

var ellipsoid = Cesium.Ellipsoid.WGS84;
var imageryUrl = 'lib/cesium/Source/Assets/Textures/';

function createImageryProvider() {
  if (lofi) {
    return new Cesium.TileMapServiceImageryProvider({
      url : imageryUrl + 'NaturalEarthII'
    });
  } else {
    return new Cesium.BingMapsImageryProvider({
      url : '//dev.virtualearth.net',
      mapStyle : Cesium.BingMapsStyle.AERIAL
    // mapStyle : Cesium.BingMapsStyle.AERIAL_WITH_LABELS
    });
  }
}

function createTerrainProvider() {
  if (lofi) {
    return new Cesium.EllipsoidTerrainProvider();
  } else {
    return new Cesium.CesiumTerrainProvider({
      url : '//cesiumjs.org/stk-terrain/tilesets/world/tiles'
    });
  }
}

function createScene(canvas) {
  var scene = new Cesium.Scene({canvas : canvas});
  scene.debugShowFramesPerSecond = true;

  var primitives = scene.primitives;

  // scene.camera.frustum._fovy = Cesium.Math.toRadians(60.0);

  var cb = new Cesium.Globe(ellipsoid);
  cb.imageryLayers.addImageryProvider(createImageryProvider());
  cb.terrainProvider = createTerrainProvider();

  scene.globe = cb;

  // Prevent right-click from opening a context menu.
  canvas.oncontextmenu = function() {
    return false;
  };

  scene.skyAtmosphere = new Cesium.SkyAtmosphere();

  var skyBoxBaseUrl = imageryUrl + 'SkyBox/tycho2t3_80';
  scene.skyBox = new Cesium.SkyBox({
    positiveX : skyBoxBaseUrl + '_px.jpg',
    negativeX : skyBoxBaseUrl + '_mx.jpg',
    positiveY : skyBoxBaseUrl + '_py.jpg',
    negativeY : skyBoxBaseUrl + '_my.jpg',
    positiveZ : skyBoxBaseUrl + '_pz.jpg',
    negativeZ : skyBoxBaseUrl + '_mz.jpg'
  });

  return scene;
}

var getCameraParams = function(camera) {
  return {
    "position" : camera.position,
    "right" : camera.right,
    "up" : camera.up,
    "direction" : camera.direction
  };
};

var setCameraParams = function(_, camera) {
  camera.position = _.position;
  camera.right = _.right;
  camera.up = _.up;
  camera.direction = _.direction;
};

var cesiumOculus = new CesiumOculus(run);

var container = document.getElementById('container');

var fullscreen = function() {
  if (container.requestFullscreen) {
    container.requestFullscreen({
      vrDisplay: cesiumOculus.getDevice()
    });
  } else if (container.mozRequestFullScreen) {
    container.mozRequestFullScreen({
      vrDisplay: cesiumOculus.getDevice()
    });
  } else if (container.webkitRequestFullscreen) {
    container.webkitRequestFullscreen({
      vrDisplay: cesiumOculus.getDevice()
    });
  }
};

function run() {
  var scene = createScene(canvasL);
  var camera = scene.camera;
  var eyeSeparation = 10.0;
  var prevCameraRotation;

  var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);

  var forwardVelocity = 0;
  var strafeVelocity = 0;

  var lastTime = (new Date()).getTime();
  var currentTime = (new Date()).getTime();

  var move = function(dt, camera, forwardVelocity, strafeVelocity) {
    Cesium.Cartesian3.add(camera.position, Cesium.Cartesian3.multiplyByScalar(camera.direction, dt * forwardVelocity, new Cesium.Cartesian3()), camera.position);
    Cesium.Cartesian3.add(camera.position, Cesium.Cartesian3.multiplyByScalar(camera.right, dt * strafeVelocity, new Cesium.Cartesian3()), camera.position);
  };

  var tick = function() {
    // TODO: Doing this outside the oculus rotation breaks mouse interaction etc
    scene.initializeFrame();

    // Store camera state
    var originalCamera = camera.clone();

    // Take into account user head rotation
    cesiumOculus.applyOculusRotation(camera, CesiumOculus.getCameraRotationMatrix(camera), cesiumOculus.getRotation());
    var modCamera = camera.clone();

    // Render right eye
    CesiumOculus.slaveCameraUpdate(modCamera, eyeSeparation * 0.5, camera);
    // cesiumOculus.setSceneParams(scene, 'right');
    scene.render();

    canvasCopy.copy(canvasL);

    // Render left eye
    CesiumOculus.slaveCameraUpdate(modCamera, -eyeSeparation * 0.5, camera);
    // cesiumOculus.setSceneParams(scene, 'left');
    scene.render();

    // Restore state
    CesiumOculus.slaveCameraUpdate(modCamera, 0.0, camera);

    // Update the camera position based on the current velocity.
    currentTime = (new Date()).getTime();
    move((currentTime - lastTime) / 1000.0, camera, forwardVelocity, strafeVelocity);
    lastTime = currentTime;

    Cesium.requestAnimationFrame(tick);
  };

  tick();

  // Resize handler
  var onResizeScene = function(canvas, scene) {
    // TODO: Removed for a decrease in latency/judder
    // Render at higher resolution so the result is still sharp
    // when magnified by the barrel distortion
    var supersample = 1.0;
    var width = canvas.clientWidth * supersample;
    var height = canvas.clientHeight * supersample;

    if (canvas.width === width && canvas.height === height) {
      return;
    }

    canvas.width = width;
    canvas.height = height;
    scene.camera.frustum.aspectRatio = width / height; // TODO: Aspect ratio?
  };

  var onResize = function() {
    onResizeScene(canvasL, scene);
    onResizeScene(canvasR, scene);
  };

  var onKeyDown = function(e) {
    if (e.keyCode === 'W'.charCodeAt(0)) {
      // Move forward
      forwardVelocity = 200;
      e.preventDefault();
    }
    if (e.keyCode === 'S'.charCodeAt(0)) {
      // Move backwards
      forwardVelocity = -200;
      e.preventDefault();
    }
    if (e.keyCode === 'D'.charCodeAt(0)) {
      // Move right
      strafeVelocity = 100;
      e.preventDefault();
    }
    if (e.keyCode === 'A'.charCodeAt(0)) {
      // Move left
      strafeVelocity = -100;
      e.preventDefault();
    }
    if (e.keyCode === 'I'.charCodeAt(0)) {
      // Get camera parameters
      alert(JSON.stringify(getCameraParams(scene.camera)));
    }
    if (e.keyCode === 'L'.charCodeAt(0)) {
      // Level the camera to the horizon
      cesiumOculus.levelCamera(scene.camera);
    }
    if (e.keyCode === 13) { // Enter
      fullscreen();
    }
    if (typeof locations[e.keyCode] !== 'undefined') {
      setCameraParams(locations[e.keyCode], scene.camera);
    }
  };

  var onKeyUp = function(e) {
    if (e.keyCode === 87 || e.keyCode === 83) {
      forwardVelocity = 0;
      e.preventDefault();
    }
    if (e.keyCode === 65 || e.keyCode === 68) {
      strafeVelocity = 0;
      e.preventDefault();
    }
  };

  window.addEventListener('resize', onResize, false);
  window.addEventListener('keydown', onKeyDown, false);
  window.addEventListener('keyup', onKeyUp, false);
  window.setTimeout(onResize, 60);
}
