var CesiumVR = (function() {
  "use strict";

  function defaultErrorHandler(msg) {
    alert(msg);
  }

  var CesiumVR = function(scale, callback, errorHandler) {
    this.ready = false;

    this.errorHandler = typeof errorHandler === 'undefined' ? defaultErrorHandler : errorHandler;

    this.hmdDevice = undefined;
    this.sensorDevice = undefined;

    this.firstTime = true;
    this.refMtx = new Cesium.Matrix3();

    this.IPDScale = scale > 0.0 ? scale : 1.0; // TODO: Pass in as parameter...?

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

      // We now have our devices... let's calculate all the required setup information...

      // Holds information about the x-axis eye separation in the world.
      that.xEyeTranslation = {
        'left'  : that.hmdDevice.getEyeTranslation('left').x * that.IPDScale,
        'right' : that.hmdDevice.getEyeTranslation('right').x * that.IPDScale
      };

      // Holds information about the recommended FOV for each eye for the detected device.
      that.fovs = {
        'left'  : that.hmdDevice.getRecommendedEyeFieldOfView('left'),
        'right' : that.hmdDevice.getRecommendedEyeFieldOfView('right')
      };

      // Given a hmd device and a eye, returns the aspect ratio for that eye
      var getAspectRatio = function(hmdDevice, eye) {
        var rect = hmdDevice.getRecommendedEyeRenderRect(eye);
        return rect.width / rect.height;
      };
      
      // Holds the aspect ratio information about each eye
      that.fovAspectRatio = {
        'left'  : getAspectRatio(that.hmdDevice, 'left'),
        'right' : getAspectRatio(that.hmdDevice, 'right')
      }

      // Calculates the required scaling and offsetting of a symmetrical fov given an asymmetrical fov.
      var FovToScaleAndOffset = function(fov) {
        var fovPort = {
          upTan: Math.tan(fov.upDegrees * Math.PI / 180.0),
          downTan: Math.tan(fov.downDegrees * Math.PI / 180.0),
          leftTan: Math.tan(fov.leftDegrees * Math.PI / 180.0),
          rightTan: Math.tan(fov.rightDegrees * Math.PI / 180.0)
        };

        var xOrigSize = 2 * Math.tan((fov.leftDegrees + fov.rightDegrees) * 0.5 * Math.PI / 180.0);
        var yOrigSize = 2 * Math.tan((fov.upDegrees + fov.downDegrees) * 0.5 * Math.PI / 180.0);

        var pxscale = Math.abs((fovPort.rightTan + fovPort.leftTan) / xOrigSize);
        var pxoffset = (fovPort.rightTan - fovPort.leftTan) * 0.5 / (fovPort.rightTan + fovPort.leftTan);
        var pyscale = Math.abs((fovPort.downTan + fovPort.upTan) / yOrigSize);
        var pyoffset = (fovPort.downTan - fovPort.upTan) * 0.5 / (fovPort.downTan + fovPort.upTan);

        return {
          scale: { x : pxscale, y : pyscale },
          offset: { x : pxoffset, y : pyoffset }
        };
      };

      // Holds the fov scaling and offset information for each eye.
      that.fovScaleAndOffset = {
        'left'  : FovToScaleAndOffset(that.fovs['left']),
        'right' : FovToScaleAndOffset(that.fovs['right'])
      };

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

  var toQuat = function(r) {
    if (r === null || r.x === 0 && r.y === 0 && r.z === 0 && r.w === 0) {
      return Cesium.Quaternion.IDENTITY;
    }
    return new Cesium.Quaternion(r.x, r.y, r.z, r.w);
  };

  CesiumVR.prototype.getRotation = function() {
    return toQuat(this.sensorDevice.getState().orientation);
  };

  CesiumVR.prototype.getPosition = function() {
    return toQuat(this.sensorDevice.getState().position);
  };

  CesiumVR.prototype.slaveCameraUpdate = function(master, slave, eye) {
    var translation = 0.0;

    if (eye === 'right' || eye === 'left') {
      // Get the correct eye translation.
      translation = this.xEyeTranslation[eye];

      // Update the frustum offset, aspect ratio and fov for the eye.
      slave.frustum.setOffset(this.fovScaleAndOffset[eye].offset.x, 0.0); // Assumes only x offset is required.
      slave.frustum.aspectRatio = this.fovAspectRatio[eye];
      if (this.fovAspectRatio[eye] > 1.0) {
        // x is the major fov
        slave.frustum.fov = (this.fovs[eye].leftDegrees + this.fovs[eye].rightDegrees) * this.fovScaleAndOffset[eye].scale.x * Math.PI / 180.0;
      } else {
        // y is the major fov
        slave.frustum.fov = (this.fovs[eye].upDegrees + this.fovs[eye].downDegrees) * this.fovScaleAndOffset[eye].scale.y * Math.PI / 180.0;
      }
    }

    var pos = Cesium.Cartesian3.clone(master.position);
    var target = Cesium.Cartesian3.clone(master.direction);
    var up = Cesium.Cartesian3.clone(master.up);

    var right = new Cesium.Cartesian3();
    Cesium.Cartesian3.cross(master.direction, master.up, right);

    Cesium.Cartesian3.multiplyByScalar(right, translation, right);
    Cesium.Cartesian3.add(pos, right, pos);

    Cesium.Cartesian3.multiplyByScalar(target, 10000, target);
    Cesium.Cartesian3.add(target, pos, target);

    slave.lookAt(pos, target, up);

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

  CesiumVR.prototype.goFullscreenVR = function(container) {
    if (container.requestFullscreen) {
      container.requestFullscreen({
        vrDisplay: this.hmdDevice
      });
    } else if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen({
        vrDisplay: this.hmdDevice
      });
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen({
        vrDisplay: this.hmdDevice
      });
    }
  }

  return CesiumVR;

}());
