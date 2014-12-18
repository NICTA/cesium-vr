var CesiumVR = (function() {
  "use strict";

  function defaultErrorHandler(msg) {
    alert(msg);
  }

  /**
   * The main VR handler for Cesium.
   *
   * Provide a value to scale the camera distance for the eyes. This
   * increases/decreases the sense of scale in Cesium.
   * 
   * Use 1.0 for a realistic sense of scale and larger values (~100.0-1000.0) for
   * a model/diorama feel.
   * 
   * @param {Number}   scale        A scalar for the Interpupillary Distance.
   * @param {Function} callback     [description]
   * @param {[type]}   errorHandler [description]
   */
  var CesiumVR = function(scale, callback, errorHandler) {
    this.errorHandler = typeof errorHandler === 'undefined' ? defaultErrorHandler : errorHandler;

    // Holds the vr device and sensor
    this.hmdDevice = undefined;
    this.sensorDevice = undefined;

    this.firstTime = true;
    this.refMtx = new Cesium.Matrix3();

    // The Interpupillary Distance scalar
    this.IPDScale = scale > 0.0 ? scale : 1.0;

    var that = this;

    /**
     * Configures CesiumVR for the attached VR devices.
     */
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
        that.errorHandler("No HMD detected");
        return;
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
        that.errorHandler("No HMD sensor detected");
        return;
      }

      // We now have our devices... let's calculate all the required setup information...
      if (that.hmdDevice) {
        // Holds information about the x-axis eye separation in the world.
        that.xEyeTranslation = {
          'left'  : that.hmdDevice.getEyeTranslation('left').x,
          'right' : that.hmdDevice.getEyeTranslation('right').x
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
      }

      if (typeof callback !== 'undefined') {
        callback();
      }
    }

    // Slight discrepancy in the api for Firefox/Chrome WebVR currently.
    if (navigator.getVRDevices) {
      navigator.getVRDevices().then(EnumerateVRDevices);
    } else if (navigator.mozGetVRDevices) {
      navigator.mozGetVRDevices(EnumerateVRDevices);
    } else {
      // No VR API detected...
      that.errorHandler("A VR-enabled browser is required for this plugin. Please visit http://mozvr.com/download.html to download a build of Firefox VR.");
    }
  };

  var toQuat = function(r) {
    if (r === null || r.x === 0 && r.y === 0 && r.z === 0 && r.w === 0) {
      return Cesium.Quaternion.IDENTITY;
    }
    return new Cesium.Quaternion(r.x, r.y, r.z, r.w);
  };

  /**
   * Returns the orientation of the HMD as a quaternion.

   * @return {Cesium.Quaternion}
   */
  CesiumVR.prototype.getRotation = function() {
    return toQuat(this.sensorDevice.getState().orientation);
  };

  /**
   * Returns the position of the HMD as a quaternion.
   *
   * NOTE: Currently not used.
   * 
   * @return {Cesium.Quaternion}
   */
  CesiumVR.prototype.getPosition = function() {
    return toQuat(this.sensorDevice.getState().position);
  };

  /**
   * Given a master camera, slave camera and eye option, this will configure
   * the slave camera with reference to the master camera for the given eye.
   *
   * It will ensure all the appropriate FOV and aspect ratio settings are
   * applied depending on the current VR equipment discovered.
   *
   * If the eye parameter is not either 'right' or 'left', it will simply clone
   * the master camera into the slave camera.
   * 
   * @param  {Cesium.Camera} master The reference camera
   * @param  {Cesium.Camera} slave  The camera to be modified
   * @param  {String}        eye    The eye specifier
   */
  CesiumVR.prototype.configureSlaveCamera = function(master, slave, eye) {
    var translation = 0.0;

    // Start with a master copy
    slave.frustum.fov = master.frustum.fov;
    slave.frustum.aspectRatio = master.frustum.aspectRatio;
    slave.frustum.setOffset(0.0, 0.0);

    if (eye === 'right' || eye === 'left') {
      // Get the correct eye translation.
      translation = this.xEyeTranslation[eye] * this.IPDScale;

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

    // Set the position and orientation using the master camera.
    var pos = Cesium.Cartesian3.clone(master.position);
    var target = Cesium.Cartesian3.clone(master.direction);
    var up = Cesium.Cartesian3.clone(master.up);

    var right = new Cesium.Cartesian3();
    Cesium.Cartesian3.cross(master.direction, master.up, right);

    // translate camera for given eye
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

  /**
   * Orient the camera with the up vector away from the center of the globe,
   * i.e. set the up vector to the same direction as the position vector.
   * 
   * @param  {Cesium.Camera} camera   The camera to normalise.
   */
  CesiumVR.prototype.levelCamera = function(camera) {
    this.firstTime = true;
    Cesium.Cartesian3.normalize(camera.position, camera.up);
    Cesium.Cartesian3.cross(camera.direction, camera.up, camera.right);
    Cesium.Cartesian3.cross(camera.up, camera.right, camera.direction);
  };

  /**
   * Reset the HMD sensor.
   */
  CesiumVR.prototype.zeroSensor = function() {
    this.sensorDevice.zeroSensor();
  };

  /**
   * Given a container HTML element (e.g. div or canvas), this will go
   * fullscreen into VR mode.
   * 
   * @param  {HTML element} container
   */
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
  };

  return CesiumVR;

}());