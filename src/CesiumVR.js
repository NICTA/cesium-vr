var CesiumVR = (function() {
  "use strict";

  // Displays a prompt given an error message
  function defaultErrorHandler(msg) {
    alert(msg);
  }

  // Given a hmd device and a eye, returns the aspect ratio for that eye
  function getAspectRatio(params) {
    var rect = params.renderRect;
    if (typeof rect === 'undefined') {
      // Must be polyfill device. Revert to browser window ratio.
      rect = window.screen;
    }
    return rect.width / rect.height;
  }
  
  // Calculates the required scaling and offsetting of a symmetrical fov given an asymmetrical fov.
  function fovToScaleAndOffset(fov) {
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
  }

  /**
   * The main VR handler for Cesium.
   *
   * Provide a value to scale the camera distance for the eyes. This
   * increases/decreases the sense of scale in Cesium.
   * 
   * Use 1.0 for a realistic sense of scale and larger values (~10.0-100.0) for
   * a model/diorama feel.
   * 
   * @param {Number}   scale        A scalar for the Interpupillary Distance.
   * @param {Function} callback     [description]
   * @param {[type]}   errorHandler [description]
   */
  var CesiumVR = function(scale, callback, errorHandler) {
    this.errorHandler = typeof errorHandler === 'undefined' ? defaultErrorHandler : errorHandler;

    this.errorMsg = "A VR-enabled browser is required for Virtual Reality Mode. Please visit http://mozvr.com/downloads for more details.";

    // Holds the vr device and sensor
    this.hmdDevice = undefined;
    this.sensorDevice = undefined;
    this.matchRealAndVirtualHorizons = false;

    // Holds the heading offset to be applied to ensure forward is 
    this.headingOffsetMatrix = Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY, new Cesium.Matrix3());

    this.previousDeviceRotation = Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY, new Cesium.Quaternion());

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

      console.log(devices);

      if (!that.hmdDevice) {
        // No HMD detected.
        that.errorHandler("No HMD detected");
        return;
      }

      // Next find a sensor that matches the HMD hardwareUnitId
      for (i = 0; i < devices.length; ++i) {
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

        var leftParams = that.hmdDevice.getEyeParameters('left');
        var rightParams = that.hmdDevice.getEyeParameters('right');

        that.xEyeTranslation = {
          left  : leftParams.eyeTranslation.x,
          right : rightParams.eyeTranslation.x
        };

        // Holds information about the recommended FOV for each eye for the detected device.
        that.fovs = {
          left  : leftParams.recommendedFieldOfView,
          right : rightParams.recommendedFieldOfView
        };

        // Holds the aspect ratio information about each eye
        that.fovAspectRatio = {
          left  : getAspectRatio(leftParams),
          right : getAspectRatio(rightParams)
        };

        // Holds the fov scaling and offset information for each eye.
        that.fovScaleAndOffset = {
          left  : fovToScaleAndOffset(that.fovs.left),
          right : fovToScaleAndOffset(that.fovs.right)
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
      // TODO: No VR API detected...
      console.log("No WebVR API detected.");
      that.errorHandler(this.errorMsg);
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
    slave.position = Cesium.Cartesian3.clone(master.position);
    slave.direction = Cesium.Cartesian3.clone(master.direction);
    slave.up = Cesium.Cartesian3.clone(master.up);
    slave.right = Cesium.Cartesian3.clone(master.right);
    slave._transform = Cesium.Matrix4.clone(master.transform);
    slave._transformChanged = true;
    master.frustum.clone(slave.frustum);

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

    // translate camera for given eye
    var tempRight = Cesium.Cartesian3.clone(slave.right);
    Cesium.Cartesian3.multiplyByScalar(tempRight, translation, tempRight);
    Cesium.Cartesian3.add(slave.position, tempRight, slave.position);
  };

  /**
   * Given a rotation matrix and a camera, it sets the cameras rotation to the rotation matrix.
   * 
   * @param {Cesium.Matrix3} rotation  the rotation matrix
   * @param {Cesium.Camera}  camera    the camera to be rotated
   */
  CesiumVR.setCameraRotationMatrix = function(rotation, camera) {
    Cesium.Matrix3.getRow(rotation, 0, camera.right);
    Cesium.Matrix3.getRow(rotation, 1, camera.up);
    Cesium.Cartesian3.negate(Cesium.Matrix3.getRow(rotation, 2, camera.direction), camera.direction);
  };

  /**
   * Grab the camera orientation from component vectors into a 3x3 Matrix.
   * 
   * @param  {Cesium.Camera}  camera  The target camera
   * @return {Cesium.Matrix3}         The rotation matrix of the target camera
   */
  CesiumVR.getCameraRotationMatrix = function(camera) {
    var result = new Cesium.Matrix3();
    Cesium.Matrix3.setRow(result, 0, camera.right, result);
    Cesium.Matrix3.setRow(result, 1, camera.up, result);
    Cesium.Matrix3.setRow(result, 2, Cesium.Cartesian3.negate(camera.direction, new Cesium.Cartesian3()), result);
    return result;
  };

  /**
   * Given a camera and a rotation quaternion, apply the rotation to the camera.
   *
   * This assumes the incoming camera has no previous VR rotation applied.
   * 
   * @param  {Cesium.Camera}     camera           The camera to rotate
   * @param  {Cesium.Quaternion} rotation         The rotation to be applied
   */
  CesiumVR.prototype.applyVRRotation = function(camera, rotation) {
    var vrRotationMatrix = Cesium.Matrix3.fromQuaternion(Cesium.Quaternion.inverse(rotation, new Cesium.Quaternion()));

    // if matching horizons
    if (this.matchRealAndVirtualHorizons) {
      camera.lookUp(-camera.pitch);
    }

    // Translate camera back to origin
    var pos = camera.position;
    camera.position = new Cesium.Cartesian3(0.0,0.0,0.0);

    // Get camera rotation matrix
    var cameraRotationMatrix = CesiumVR.getCameraRotationMatrix(camera);

    // Apply the heading offset to camera
    Cesium.Matrix3.multiply(this.headingOffsetMatrix, cameraRotationMatrix, cameraRotationMatrix);

    // Apply VR rotation to offset camera rotation matrix
    var newRotation = Cesium.Matrix3.multiply(vrRotationMatrix, cameraRotationMatrix, new Cesium.Matrix3());

    // rotate camera using matrix
    CesiumVR.setCameraRotationMatrix(newRotation, camera);

    // translate back to position
    camera.position = pos;
  };

  /**
   * Orient the camera with the up vector away from the center of the globe,
   * i.e. set the up vector to the same direction as the position vector.
   * 
   * @param  {Cesium.Camera} camera   The camera to normalise.
   */
  CesiumVR.prototype.levelCamera = function(camera) {
    Cesium.Cartesian3.normalize(camera.position, camera.up);
    Cesium.Cartesian3.cross(camera.direction, camera.up, camera.right);
    Cesium.Cartesian3.cross(camera.up, camera.right, camera.direction);
  };

  /**
   * Reset the HMD sensor heading.
   */
  CesiumVR.prototype.recenterHeading = function() {
    // Isolate the heading (yaw) angle to apply as an offset
    // Note: y is the yaw axis of rotation for the VR device.
    var q = this.getRotation();

    // Zero out rotation axes we're not interested in
    q.x = 0;
    q.z = 0;

    // Renormalise quaternion
    var mag = Math.sqrt(q.y * q.y + q.w * q.w);
    q.y /= mag;
    q.w /= mag;

    // Save rotation as Matrix3
    this.headingOffsetMatrix = Cesium.Matrix3.fromQuaternion(q);
  };

  /**
   * Given a container HTML element (e.g. div or canvas), this will go
   * fullscreen into VR mode.
   * 
   * @param  {HTML element} container
   */
  CesiumVR.prototype.goFullscreenVR = function(container) {
    if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen({
        vrDisplay: this.hmdDevice
      });
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen({
        vrDisplay: this.hmdDevice
      });
    }
  };

  /**
   * Gets the frustum offsets
   */
  CesiumVR.prototype.getOffsets = function() {
    return {
      left  : this.fovScaleAndOffset.left.offset,
      right : this.fovScaleAndOffset.right.offset
    };
  };

  return CesiumVR;

}());