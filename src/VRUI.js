/**
 * A simple UI handler for CesiumVR
 */
var VRUI = (function() {
  "use strict";

  var VRUI = function(uiDiv, fovOffsets, stereoEnabled) {
    this.div = uiDiv;
    this.hidden = true;
    this.div.style.display = this.hidden ? 'none' : 'block';

    this.fovOffsets = fovOffsets;

    // Add 2 left/right divs to contain copies of the same elements.
    var leftEye = document.createElement('div');
    leftEye.className = 'eye';
    leftEye.id = 'uiContainerLeft';
    leftEye.style.position = 'relative';

    // Shift these UI containing divs according to the provided offset
    leftEye.style.left = (-fovOffsets.left.x * 50) + '%';
    leftEye.style.top = (-fovOffsets.left.y * 50) + '%';
    this.div.appendChild(leftEye);

    var rightEye = leftEye.cloneNode(true);
    rightEye.id = 'uiContainerRight';
    rightEye.style.left = (-fovOffsets.right.x * 50) + '%';
    rightEye.style.top = (-fovOffsets.right.y * 50) + '%';
    this.div.appendChild(rightEye);

    this.leftEye = leftEye;
    this.rightEye = rightEye;


    // ---------------------
    // Create the UI items
    // ---------------------
    
    this.fps = new FPS();

    var fpsDiv = document.createElement('div');
    fpsDiv.className = 'fps';

    this.leftEyeFps = fpsDiv;
    this.rightEyeFps = fpsDiv.cloneNode(true);

    this.leftEye.appendChild(this.leftEyeFps);
    this.rightEye.appendChild(this.rightEyeFps);

    this.setStereo(stereoEnabled);
  };

  VRUI.prototype.update = function() {
    // Update the FPS counter
    this.leftEyeFps.innerHTML = "FPS: " + this.fps.update();
    this.rightEyeFps.innerHTML = this.leftEyeFps.innerHTML;
  };

  VRUI.prototype.setStereo = function(enabled) {
    this.stereo = enabled;
    this.rightEye.style.visibility = this.stereo ? "visible" : "hidden";
    this.leftEye.style.width = this.stereo ? "50%" : "100%";
    if (this.stereo) {
        this.leftEye.style.left = (-this.fovOffsets.left.x * 50) + '%';
        this.leftEye.style.top = (-this.fovOffsets.left.y * 50) + '%';
    } else {
        this.leftEye.style.left = '0%';
        this.leftEye.style.top = '0%';
    }
  };

  VRUI.prototype.toggleShow = function() {
    this.hidden = !this.hidden;
    this.div.style.display = this.hidden ? 'none' : 'block';
  };

  return VRUI;

})();