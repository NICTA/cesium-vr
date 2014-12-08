var CesiumVR = (function() {
  "use strict";

  function defaultErrorHandler(msg) {
    alert(msg);
  }

  var CesiumVR = function(callback, errorHandler) {
    this.ready = false;

    this.errorHandler = typeof errorHandler === 'undefined' ? defaultErrorHandler : errorHandler;
    this.state = undefined;
    this.hmdInfo = undefined;

    this.hmdDevice = undefined;
    this.sensorDevice = undefined;

    this.firstTime = true;
    this.refMtx = new Cesium.Matrix3();

    this.IPDScale = 1.0; // TODO: Pass in as parameter...?

    var that = this;

    function EnumerateVRDevices(devices) {
      // First find an HMD device
      for (var i = 0; i < devices.length; ++i) {
        if (devices[i] instanceof HMDVRDevice) {
          that.hmdDevice = devices[i];
          break;
        }
      }

      if (!that.hmdDevice) {
        // No HMD detected.
        defaultErrorHandler("No HMD detected");
      }

      // Next find a sensor that matches the HMD hardwareUnitId
      for (var i = 0; i < devices.length; ++i) {
        if (devices[i] instanceof PositionSensorVRDevice &&
             (!that.hmdDevice || devices[i].hardwareUnitId == that.hmdDevice.hardwareUnitId)) {
          that.sensorDevice = devices[i];
          break;
        }
      }

      if (!that.sensorDevice) {
        // No HMD sensor detected.
        defaultErrorHandler("No HMD sensor detected");
      }

      // Holds information about the x-axis eye separation in the world.
      that.xEyeTranslation = {
        'left'  : -that.hmdDevice.getEyeTranslation('left').x * that.IPDScale,
        'right' : -that.hmdDevice.getEyeTranslation('right').x * that.IPDScale
      };

      var recommendedFovs = {
        'left'  : that.hmdDevice.getRecommendedEyeFieldOfView('left'),
        'right' : that.hmdDevice.getRecommendedEyeFieldOfView('right')
      };

      var getFovs = function(fov) {
        return {
          x : fov.leftDegrees + fov.rightDegrees,
          y : fov.upDegrees + fov.downDegrees
        };
      };

      that.fovs = {
        'left'  : getFovs(recommendedFovs['left']),
        'right' : getFovs(recommendedFovs['right']),
      };

      console.log(recommendedFovs);

      var toRad =  Math.PI / 180.0;

      // Gets the 4 viewport distances for the given fov
      var getViewportDists = function(fov) {
        return {
          leftDist : Math.tan(fov.leftDegrees * toRad),
          rightDist : Math.tan(fov.rightDegrees * toRad),
          upDist   : Math.tan(fov.upDegrees * toRad),
          downDist : Math.tan(fov.downDegrees * toRad)
        };
      };

      var viewportDists = {
        'left'  : getViewportDists(recommendedFovs['left']),
        'right' : getViewportDists(recommendedFovs['right'])
      };

      // Gets the viewport distances assuming a symmetrical fov.
      var getViewportOriginalDists = function(fov) {
        return {
          xDist : 2 * Math.tan((fov.x / 2.0) * toRad),
          yDist : 2 * Math.tan((fov.y / 2.0) * toRad)
        };
      };

      var viewportOrigDists = {
        'left'  : getViewportOriginalDists(that.fovs['left']),
        'right' : getViewportOriginalDists(that.fovs['right'])
      }

      // Gets the scaling factor for asymmetrical fov.
      var vpDistToScale = function(vpDists, vpOrigDists) {
        console.log(vpDists.leftDist + vpDists.rightDist);
        console.log(vpOrigDists.xDist);

        var xScale = (vpDists.leftDist + vpDists.rightDist) / vpOrigDists.xDist;
        var yScale = (vpDists.upDist + vpDists.downDist) / vpOrigDists.yDist;

        return { x : xScale, y : yScale };
      };

      that.fovScales = {
        'left'  : vpDistToScale(viewportDists['left'], viewportOrigDists['left']),
        'right' : vpDistToScale(viewportDists['right'], viewportOrigDists['right'])
      };

      // Gets the amount of offset for asymmetrical fov.
      var vpDistToOffset = function(vpDists) {
        var dx = (vpDists.rightDist - vpDists.leftDist) * 0.5;
        var dy = (vpDists.upDist - vpDists.downDist) * 0.5;
        return { x : dx, y : dy };
      };

      that.fovOffsets = {
        'left'  : vpDistToOffset(viewportDists['left']),
        'right' : vpDistToOffset(viewportDists['right'])
      };

      that.ready = true;

      console.log(that.xEyeTranslation);
      console.log(that.fovOffsets);
      console.log(that.fovScales);
      console.log(that.fovs);


      if (typeof callback !== 'undefined') {
        callback();
      }
    }

    // Slight discrepancy in the api for WebVR currently.
    if (navigator.getVRDevices) {
      navigator.getVRDevices().then(EnumerateVRDevices);
    } else if (navigator.mozGetVRDevices) { // TODO: Still required?
      navigator.mozGetVRDevices(EnumerateVRDevices);
    }
  };

  CesiumVR.prototype.toQuat = function(r) {
    if (r.x === 0 && r.y === 0 && r.z === 0 && r.w === 0) {
      return Cesium.Quaternion.IDENTITY;
    }
    return new Cesium.Quaternion(r.x, r.y, r.z, r.w);
  };

  CesiumVR.prototype.getRotation = function() {
    var state = this.sensorDevice.getState();

    if (state.orientation !== null) {
      return this.toQuat(state.orientation);
    } else {
      // No orientation from device.
      return this.toQuat({x : 0, y : 0, z : 0, w : 0});
    }
  };

  CesiumVR.prototype.slaveCameraUpdate = function(master, slave, eye) {
    // TODO: Check for valid input?
    switch (eye) {
    case 'left':
    case 'right':
      var eyeOffset = this.xEyeTranslation[eye];

      // Set slave position and orientation
      var right = new Cesium.Cartesian3();
      var position = Cesium.Cartesian3.clone(master.position);
      var target   = Cesium.Cartesian3.clone(master.direction);
      var up       = Cesium.Cartesian3.clone(master.up);

      Cesium.Cartesian3.cross(target, up, right);
      
      // Get the camera target point
      Cesium.Cartesian3.multiplyByScalar(target, 10000, target); // Is this necessary?

      // Move the camera horizontally with eyeOffset magnitude
      Cesium.Cartesian3.multiplyByScalar(right, eyeOffset, right);
      Cesium.Cartesian3.add(position, right, position);

      // Using parallel line of sight (i.e. not converged)
      Cesium.Cartesian3.add(target, position, target);

      // Set target 
      slave.lookAt(position, target, up);


      var fov = this.fovs[eye];

      // Set slave fov and scale
      slave.frustum.fov = fov.x * this.fovScales[eye].x;

      // Set the fov offset
      slave.frustum.setOffset(this.fovOffsets[eye].x, 0.0);


      console.log(master.frustum);
      break;
    default:
      // Reset slave === master
      slave.lookAt(master.position, master.direction, master.up);
    }

  };

  CesiumVR.setCameraRotationMatrix = function(rotation, camera) {
    Cesium.Matrix3.getRow(rotation, 0, camera.right);
    Cesium.Matrix3.getRow(rotation, 1, camera.up);
    Cesium.Cartesian3.negate(Cesium.Matrix3.getRow(rotation, 2, camera.direction), camera.direction);
  };

  CesiumVR.getCameraRotationMatrix = function(camera) {
    var result = new Cesium.Matrix3();
    Cesium.Matrix3.setRow(result, 0, camera.right, result);
    Cesium.Matrix3.setRow(result, 1, camera.up, result);
    Cesium.Matrix3.setRow(result, 2, Cesium.Cartesian3.negate(camera.direction, new Cesium.Cartesian3()), result);
    return result;
  };

  // Not here!
  CesiumVR.setCameraState = function(src, camera){
    camera.position = Cesium.Cartesian3.clone(src.position);
    camera.direction = Cesium.Cartesian3.clone(src.direction);
    camera.up = Cesium.Cartesian3.clone(src.up);
    camera.right = Cesium.Cartesian3.clone(src.right);
    camera.transform = Cesium.Matrix4.clone(src.transform);
    camera.frustum = src.frustum.clone();
  };

  CesiumVR.prototype.levelCamera = function(camera) {
    this.firstTime = true;
    Cesium.Cartesian3.normalize(camera.position, camera.up);
    Cesium.Cartesian3.cross(camera.direction, camera.up, camera.right);
  };

  CesiumVR.prototype.applyVRRotation = function(camera, prevCameraMatrix, rotation) {
    var VRRotationMatrix = Cesium.Matrix3.fromQuaternion(Cesium.Quaternion.inverse(rotation, new Cesium.Matrix3()));
    var sceneCameraMatrix = CesiumVR.getCameraRotationMatrix(camera);
    if (this.firstTime) {
      Cesium.Matrix3.inverse(VRRotationMatrix, this.refMtx);
      Cesium.Matrix3.multiply(this.refMtx, sceneCameraMatrix, this.refMtx);
    } else {
      var temp = new Cesium.Matrix3();
      Cesium.Matrix3.inverse(prevCameraMatrix, temp);
      Cesium.Matrix3.multiply(temp, sceneCameraMatrix, temp);
      Cesium.Matrix3.multiply(this.refMtx, temp, this.refMtx);
    }
    Cesium.Matrix3.multiply(VRRotationMatrix, this.refMtx, prevCameraMatrix);
    CesiumVR.setCameraRotationMatrix(prevCameraMatrix, camera);
    this.firstTime = false;
  };

  CesiumVR.prototype.getDevice = function() {
    return this.hmdDevice;
  };

  return CesiumVR;

}());
