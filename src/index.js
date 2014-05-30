require([ './src/locations.js' ], function( locations) {

  "use strict";

  var lofi = false;
  var postprocess = true;

  var canvasL = document.createElement('canvas');
  canvasL.className = "fullSize";
  document.getElementById('cesiumContainerLeft').appendChild(canvasL);

  var canvasR = document.createElement('canvas');
  canvasR.className = "fullSize";
  document.getElementById('cesiumContainerRight').appendChild(canvasR);
  var contextR = canvasR.getContext('2d');

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

  function createScene(canvas, hmd) {
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

  var cesiumOculus = new CesiumOculus(run);

  function run(hmd) {
    var scene = createScene(canvasL, hmd);

    var ellipsoid = Cesium.Ellipsoid.clone(Cesium.Ellipsoid.WGS84);

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
      firstTime = true;
    };

    var levelTheCamera = function(camera) {
      Cesium.Cartesian3.normalize(camera.position, camera.up);
      Cartesian3.cross(camera.direction, camera.up, camera.right);
      // Cartesian3.cross(camera.up, camera.right, camera.direction);
      firstTime = true;
    }

    var tick = function() {
      cesiumOculus.applyOculusRotation(scene.camera, cesiumOculus.getRotation());

      var eyeSeparation = 1.0;

      // Render right eye
      cesiumOculus.setSceneParams(scene, 'right');
      scene.initializeFrame();
      scene.render();
      contextR.drawImage(canvasL, 0, 0); // Copy to right eye canvas

      // Render left eye
      var originalCamera = scene.camera.clone()
      CesiumOculus.slaveCameraUpdate(originalCamera, scene.camera, -eyeSeparation);
      cesiumOculus.setSceneParams(scene, 'left');
      scene.initializeFrame();
      scene.render();

      CesiumOculus.slaveCameraUpdate(originalCamera, scene.camera, 0.0);
      Cesium.requestAnimationFrame(tick);
    }

    tick();

    // Resize handler
    var onResizeScene = function(canvas, scene) {
      var riftAspect = 1.0; // should be 0.8
      var width = canvas.clientWidth;
      var height = canvas.clientHeight;

      if (canvas.width === width && canvas.height === height) {
        return;
      }

      canvas.width = width;
      canvas.height = height;
      scene.camera.frustum.aspectRatio = width / height * riftAspect;
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

});
