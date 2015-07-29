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

var WakeLock = CesiumVRUtil.getWakeLock();
var wakelock = new WakeLock();

var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);
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

var cesiumVR = new CesiumVR(100.0, run);

var container = document.getElementById('container');

function run() {
  var scene = createScene(canvasL);
  var camera = scene.camera;


  /* MAIN UPDATE LOOP */

  var tick = function() {
    // TODO: Doing this outside the vr rotation breaks mouse interaction etc
    // scene.initializeFrame(); // Why?

    if(vrEnabled){
      var rotation = cesiumVR.getRotation();

      // Copy original camera without VR rotation applied
      var originalCam = camera.clone();

      // Apply user head rotation
      cesiumVR.applyVRRotation(camera, rotation);
      var VRCam = camera.clone();

      // Render right eye
      cesiumVR.configureSlaveCamera(VRCam, camera, 'right');
      scene.render();

      canvasCopy.copy(canvasL);

      // Render left eye
      cesiumVR.configureSlaveCamera(VRCam, camera, 'left');
      scene.render();

      // Restore camera state before VR
      cesiumVR.configureSlaveCamera(originalCam, camera);
    } else {
      scene.render();
    }

    Cesium.requestAnimationFrame(tick);
  };

  tick();


  /* RESIZE HANDLER */

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

  window.addEventListener('resize', onResize, false);
  window.setTimeout(onResize, 60);


  /* KEYBOARD INPUT HANDLERS */

  var locationIndex = 0;

  var nextLocation = function() {
    locationIndex = (locationIndex + 1) % locations.length;
    setCameraParams(locations[locationIndex], scene.camera);
  };

  var prevLocation = function() {
    locationIndex = (locationIndex === 0) ? locationIndex + locations.length - 1 : locationIndex - 1;
    setCameraParams(locations[locationIndex], scene.camera);
  };

  // Basic WASD keys implemented w/ shift for speed up.
  var onKeyDown = function(e) {
    if (e.keyCode === 'H'.charCodeAt(0)) {
      // Show the help text
      cesiumVR.recenterHeading();
      e.preventDefault();
    }
    if (e.keyCode === 13) { // Enter
      // Turn on both Canvases and enter fullscreen
      cesiumVR.goFullscreenVR(container);
      e.preventDefault();
    }
    if (e.keyCode === 'Z'.charCodeAt(0)) {
      // Go to previous location...
      prevLocation();
      e.preventDefault();
    }
    if (e.keyCode === 'X'.charCodeAt(0) ||
        e.keyCode === ' '.charCodeAt(0)) { // X or space
      // Go to next location...
      nextLocation();
      e.preventDefault();
    }
  };

  window.addEventListener('keydown', onKeyDown, false);


  /* TOUCH HANDLERS FOR MOBILE DEVICES */

  var holdTimeout = null;
  var tapTimeout = null;

  var DOUBLETAP_TIME = 500;
  var HOLDTAP_TIME   = 1000;

  var onTouch = function(e) {
    // Checks for double taps...
    if (tapTimeout == null) {
      // First tap... set timeout callback, cancelling double tap if timed out.
      tapTimeout = setTimeout(function() {
        // Single tap!
        tapTimeout = null;
      }, DOUBLETAP_TIME);

      // Setup hold timeout callback...
      holdTimeout = setTimeout(function() {
        // Cycle through locations...
        nextLocation();
        // Cancel a double tap after a hold
        tapTimeout = null;
      }, HOLDTAP_TIME);
    } else {
      // Double tap!
      clearTimeout(tapTimeout);
      tapTimeout = null;
      // Go full screen...
      cesiumVR.goFullscreenVR(container);
    }
    e.preventDefault();
  };

  var onRelease = function(e) {
    // If released, cancel the hold timeout callback...
    clearTimeout(holdTimeout);
  };

  window.addEventListener('touchstart', onTouch, false);
  window.addEventListener('touchend', onRelease, false);


  /* VR MODE HANDLER */

  var fullscreenchange = container.mozRequestFullScreen ? "mozfullscreenchange" : "webkitfullscreenchange";

  var onFullscreenChange = function() {
    vrEnabled = document.mozFullScreenElement || document.webkitFullscreenElement;

    // Set eye containers
    document.getElementById("cesiumContainerRight").style.visibility = vrEnabled ? "visible" : "hidden";
    document.getElementById("cesiumContainerLeft").style.width = vrEnabled ? "50%" : "100%";
    onResize();
    
    if (CesiumVRUtil.isMobile()) {
      if (vrEnabled) {
        // Request landscape orientation
        screen.orientation.lock('landscape');
        // Request a wakelock if vr enabled and mobile
        wakelock.request();
      } else {
        // Unlock screen orientation
        screen.orientation.unlock();
        // Release the wakelock
        wakelock.release();
      }
    }
  };

  document.addEventListener(fullscreenchange, onFullscreenChange, false);


  /* HELP ALERT */

  var showHelpScreen = function() {
    var desktopHelpString = [
      "Demo controls:",
      "",
      "Enter - go into VR Mode",
      "Esc   - Exit VR Mode",
      "",
      "Z     - Jump to next location",
      "X     - Jump to previous location",
      "",
      "H     - Reset the VR device"
    ];

    var mobileHelpString = [
      "Demo controls:",
      "",
      "Double Tap - go into VR Mode",
      "Back       - Exit VR Mode",
      "",
      "Hold Touch - Jump to next location"
    ];

    if (CesiumVRUtil.isMobile()) {
      alert(mobileHelpString.join('\n')); 
    } else {
      alert(desktopHelpString.join('\n')); 
    }
  };

  showHelpScreen();
}
