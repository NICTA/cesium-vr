"use strict";

var lofi = false;
var postprocess = true;
var webglCopy = true;

var canvasL = document.createElement('canvas');
canvasL.className = "fullSize";
document.getElementById('cesiumContainerLeft').appendChild(canvasL);

var canvasR = document.createElement('canvas');
canvasR.className = "fullSize";
document.getElementById('cesiumContainerRight').appendChild(canvasR);

var canvasCopy = new CanvasCopy(canvasR, webglCopy);

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
  var scene = new Cesium.Scene(canvas);
  var primitives = scene.primitives;

  scene.camera.frustum.fovy = Cesium.Math.toRadians(90.0);

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

var levelTheCamera = function(camera) {
  Cesium.Cartesian3.normalize(camera.position, camera.up);
  Cartesian3.cross(camera.direction, camera.up, camera.right);
}

var cesiumOculus = new CesiumOculus(run);

function run() {
  var scene = createScene(canvasL);
  var camera = scene.camera;
  var eyeSeparation = 2.0;
  var prevCameraRotation;

  var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);

  var tick = function() {
    // Store camera state
    var cameraRotation = CesiumOculus.getCameraRotationMatrix(camera);

    if (typeof prevCameraRotation !== 'undefined') {
      cesiumOculus.applyOculusRotation(camera, prevCameraRotation, cesiumOculus.getRotation());
    }

    // Render right eye
    cesiumOculus.setSceneParams(scene, 'right');
    scene.initializeFrame();
    scene.render();

    canvasCopy.copy(canvasL);

    // Render left eye
    var originalCamera = scene.camera.clone()
    CesiumOculus.slaveCameraUpdate(originalCamera, scene.camera, -eyeSeparation);
    cesiumOculus.setSceneParams(scene, 'left');
    scene.initializeFrame();
    scene.render();

    // Restore state
    CesiumOculus.slaveCameraUpdate(originalCamera, scene.camera, 0.0);
    CesiumOculus.setCameraRotationMatrix(cameraRotation, camera);
    prevCameraRotation = cameraRotation;

    Cesium.requestAnimationFrame(tick);
  }

  tick();

  // Resize handler
  var onResizeScene = function(canvas, scene) {
    // Render at higher resolution so the result is still sharp
    // when magnified by the barrel distortion
    var supersample = 1.5;
    var width = canvas.clientWidth * supersample;
    var height = canvas.clientHeight * supersample;

    if (canvas.width === width && canvas.height === height) {
      return;
    }

    canvas.width = width;
    canvas.height = height;
    scene.camera.frustum.aspectRatio = width / height;
  };

  var onResize = function() {
    onResizeScene(canvasL, scene);
    onResizeScene(canvasR, scene);
  };

  var moveForward = function(camera, amount) {
    Cesium.Cartesian3.add(camera.position, Cesium.Cartesian3.multiplyByScalar(camera.direction, amount), camera.position);
  }

  var onKeyDown = function(e) {
    // alert(JSON.stringify(e.keyCode));
    if (e.keyCode === 38) {
      moveForward(scene.camera, 10.0);
      e.preventDefault();
    }
    if (e.keyCode === 40) {
      moveForward(scene.camera, -10.0);
      e.preventDefault();
    }
    if (e.keyCode === 73)
      alert(JSON.stringify(getCameraParams(scene.camera)));
    if (e.keyCode === 76)
      levelTheCamera(scene.camera);
    if (typeof locations[e.keyCode] !== 'undefined') {
      setCameraParams(locations[e.keyCode], scene.camera);
    }
  }

  window.addEventListener('resize', onResize, false);
  window.addEventListener('keydown', onKeyDown, false);
  window.setTimeout(onResize, 60);
}
