"use strict";

var lofi = false;
var vrEnabled = false;

var canvasL = document.createElement('canvas');
canvasL.className = "fullSize";
document.getElementById('cesiumContainerLeft').appendChild(canvasL);
document.getElementById("cesiumContainerLeft").style.width = vrEnabled ? "50%" : "100%";

var canvasR = document.createElement('canvas');
canvasR.className = "fullSize";
document.getElementById('cesiumContainerRight').appendChild(canvasR);
document.getElementById("cesiumContainerRight").style.visibility = vrEnabled ? "visible" : "hidden";

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

  // Clone the frustum properties into our patched frustum object...
  var patchedFrustum = scene.camera.frustum.clone(new PerspectiveFrustumPatch());
  // Patch the camera frustum prototype...
  scene.camera.frustum = patchedFrustum;

  var primitives = scene.primitives;

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

  // var modelMatrix = Cesium.Transforms.northEastDownToFixedFrame(Cesium.Cartesian3.fromDegrees(-123.0744619, 44.0503706, 500));
  // var model = Cesium.Model.fromGltf({
  //   url : 'lib/models/CesiumAir/Cesium_Air.gltf',
  //   modelMatrix : modelMatrix,
  //   scale : 20.0,
  //   minimumPixelSize : 50,
  // });
  // scene.primitives.add(model);

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

// Used for movement, update the camera position based on the dt (in secs) and the velocities.
var move = function(camera, dt, velocities, multiplier) {
  Cesium.Cartesian3.add(
    camera.position,
    Cesium.Cartesian3.multiplyByScalar(camera.direction, dt * velocities.forward * multiplier, new Cesium.Cartesian3()),
    camera.position);
  Cesium.Cartesian3.add(camera.position,
    Cesium.Cartesian3.multiplyByScalar(camera.right, dt * velocities.strafe * multiplier, new Cesium.Cartesian3()),
    camera.position);
  Cesium.Cartesian3.add(camera.position,
    Cesium.Cartesian3.multiplyByScalar(camera.up, dt * velocities.vertical * multiplier, new Cesium.Cartesian3()),
    camera.position);
};

var cesiumVR = new CesiumVR(100.0, run);

var container = document.getElementById('container');
var uiDiv     = document.getElementById('ui');

function run() {
  var scene = createScene(canvasL);
  var ui = new VRUI(uiDiv, cesiumVR.getOffsets(), vrEnabled);

  var camera = scene.camera;

  var prevCameraRotation;

  var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);

  var velocities = {
    forward  : 0.0,
    strafe   : 0.0,
    vertical : 0.0
  };

  var multiplier = 1.0;

  var lastTime = new Date().getTime();
  var currentTime = new Date().getTime();

  var tick = function() {
    // TODO: Doing this outside the vr rotation breaks mouse interaction etc
    scene.initializeFrame();

    if(vrEnabled){
      // Take into account user head rotation
      cesiumVR.applyVRRotation(camera, CesiumVR.getCameraRotationMatrix(camera), cesiumVR.getRotation());
      var masterCam = camera.clone();

      // Render right eye
      cesiumVR.configureSlaveCamera(masterCam, camera, 'right');
      scene.render();

      canvasCopy.copy(canvasL);

      // Render left eye
      cesiumVR.configureSlaveCamera(masterCam, camera, 'left');
      scene.render();

      // Restore camera state
      cesiumVR.configureSlaveCamera(masterCam, camera);
    } else {
      scene.render();
    }

    // Move camera based on current velocities.
    currentTime = new Date().getTime();
    move(camera, (currentTime - lastTime) / 1000.0, velocities, multiplier);
    lastTime = currentTime;

    ui.update();

    Cesium.requestAnimationFrame(tick);
  };

  tick();

  // Resize handler
  var onResizeScene = function(canvas, scene) {
    // Render at higher resolution so the result is still sharp
    // when magnified by the barrel distortion
    var supersample = vrEnabled ? 1.0 : 1.0; // Could increase this to >1 to increase VR resolution
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
    onResizeScene(canvasR, scene);
    onResizeScene(canvasL, scene);
  };

  var setVRContainers = function() {
    ui.setStereo(vrEnabled);
    document.getElementById("cesiumContainerRight").style.visibility = vrEnabled ? "visible" : "hidden";
    document.getElementById("cesiumContainerLeft").style.width = vrEnabled ? "50%" : "100%";
    onResize();
  };

  var velocity = 250;

  // Basic WASD keys implemented w/ shift for speed up.
  var onKeyDown = function(e) {
    if (e.keyCode === 'W'.charCodeAt(0)) {
      // Move forward
      velocities.forward = velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'S'.charCodeAt(0)) {
      // Move backwards
      velocities.forward = -velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'D'.charCodeAt(0)) {
      // Move right
      velocities.strafe = velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'A'.charCodeAt(0)) {
      // Move left
      velocities.strafe = -velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'Q'.charCodeAt(0)) {
      // Move up
      velocities.vertical = velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'E'.charCodeAt(0)) {
      // Move down
      velocities.vertical = -velocity;
      e.preventDefault();
    }
    if (e.keyCode === 'L'.charCodeAt(0)) {
      // Level the camera to the horizon
      cesiumVR.levelCamera(scene.camera);
      e.preventDefault();
    }
    if (e.keyCode === 'K'.charCodeAt(0)) {
      // Show the help text
      showHelpScreen();
      e.preventDefault();
    }
    if (e.keyCode === 'F'.charCodeAt(0)) {
      // Toggle the FPS counter
      ui.toggleShow();
      e.preventDefault();
    }
    if (e.keyCode === 'P'.charCodeAt(0)) {
      // Print current camera position
      console.log(JSON.stringify(getCameraParams(scene.camera)));
      e.preventDefault();
    }
    if (e.keyCode === 16) { // Shift
      // Speed up user movement
      multiplier = 2.0;
      e.preventDefault();
    }
    if (e.keyCode === 13) { // Enter
      // Turn on both Canvases and enter fullscreen
      cesiumVR.goFullscreenVR(container);
      e.preventDefault();
    }
    if (typeof locations[e.keyCode] !== 'undefined') {
      // Go to a location...
      setCameraParams(locations[e.keyCode], scene.camera);
    }
  };

  var onKeyUp = function(e) {
    if (e.keyCode === 'W'.charCodeAt(0) || e.keyCode === 'S'.charCodeAt(0)) {
      velocities.forward = 0;
      e.preventDefault();
    }
    if (e.keyCode === 'D'.charCodeAt(0) || e.keyCode === 'A'.charCodeAt(0)) {
      velocities.strafe = 0;
      e.preventDefault();
    }
    if (e.keyCode === 'Q'.charCodeAt(0) || e.keyCode === 'E'.charCodeAt(0)) {
      velocities.vertical = 0;
      e.preventDefault();
    }
    if (e.keyCode === 16) { // Shift
      multiplier = 1.0;
    }
  };

  window.addEventListener('resize', onResize, false);
  window.addEventListener('keydown', onKeyDown, false);
  window.addEventListener('keyup', onKeyUp, false);
  window.setTimeout(onResize, 60);

  var showHelpScreen = function() {
    var helpString = [
      "Demo controls:",
      "",
      "Enter \t- go into VR Mode",
      "Esc \t\t- Exit VR Mode",
      "",
      "1-6 \t\t- Jump to a location in the globe",
      "L   \t\t- level the camera to the globe",
      "",
      "WASD  \t- Move horizontally",
      "QE  \t\t- Move vertically",
      "Shift \t- Increase movement speed",
      "",
      "F   \t\t- toggle FPS counter",
      "K   \t\t- show this help text",
    ];

    alert(helpString.join('\n')); 
  };

  // Enable/disable VR mode when entering/leaving fullscreen.
  var fullscreenchange = container.mozRequestFullScreen ? "mozfullscreenchange" : "webkitfullscreenchange";
  document.addEventListener(fullscreenchange, function() {
    vrEnabled = document.mozFullScreenElement || document.webkitFullscreenElement;
    setVRContainers();
  }, false);

  showHelpScreen();
}
