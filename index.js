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
  var primitives = scene.primitives;

  scene.camera.frustum._fovy = Cesium.Math.toRadians(120.0);

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
};

var cesiumOculus = new CesiumOculus(run);

var fullscreen = function() {
  if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen({
          vrDisplay: cesiumOculus.hmdDevice
      });
  } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen({
          vrDisplay: cesiumOculus.hmdDevice
      });
  }
};

function run() {
  var scene = createScene(canvasL);
  var camera = scene.camera;
  var eyeSeparation = 50.0;
  var prevCameraRotation;

  var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);

  var container = document.getElementById('container');

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
    cesiumOculus.setSceneParams(scene, 'right');
    scene.render();

    canvasCopy.copy(canvasL);

    // Render left eye
    CesiumOculus.slaveCameraUpdate(modCamera, -eyeSeparation * 0.5, camera);
    cesiumOculus.setSceneParams(scene, 'left');
    scene.render();

    // Restore state
    CesiumOculus.slaveCameraUpdate(originalCamera, 0.0, camera);
    CesiumOculus.setCameraState(originalCamera, camera);

    Cesium.requestAnimationFrame(tick);
  };

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
    scene.camera.frustum.aspectRatio = width / height; // TODO: Aspect ratio?
  };

  var onResize = function() {
    onResizeScene(canvasL, scene);
    onResizeScene(canvasR, scene);
  };

  var moveForward = function(camera, amount) {
    Cesium.Cartesian3.add(camera.position, Cesium.Cartesian3.multiplyByScalar(camera.direction, amount), camera.position);
  };

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
    if (e.keyCode === 73) {
      alert(JSON.stringify(getCameraParams(scene.camera)));
    }
    if (e.keyCode === 76) {
      levelTheCamera(scene.camera);
    }
    if (e.keyCode === 13) {
      fullscreen();
    }
    if (typeof locations[e.keyCode] !== 'undefined') {
      setCameraParams(locations[e.keyCode], scene.camera);
    }
  };

  window.addEventListener('resize', onResize, false);
  window.addEventListener('keydown', onKeyDown, false);
  window.setTimeout(onResize, 60);
}
