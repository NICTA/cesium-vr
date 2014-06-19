<a href="http://nicta.com.au/"><img align="right" src="images/nicta_logo.png"></a>
<br>

cesium-oculus-plugin
====================

A plugin for [Cesium WebGL Virtual Globe](http://cesiumjs.org) to support the [Oculus Rift VR headset](http://www.oculusvr.com/).
Try the [live demo](http://nicta.github.io/cesium-oculus-plugin/) (click through the dialogs if you don't have an Oculus & VR.js handy).

[![screengrab](/images/screengrab.jpg)](http://nicta.github.io/cesium-oculus-plugin/)

### Build

1. Clone the repo

2. Get the git submodules (see License note below)

        cd ~/git/cesium-oculus-plugin
        git submodule init
        git submodule update

3. Build Cesium

        cd ~/git/cesium-oculus-plugin
        cd lib/cesium
        ./Tools/apache-ant-1.8.2/bin/ant


### Use

* Run via a local http server, e.g. with node.js http-server

        cd ~/git/cesium-oculus-plugin
        http-server

* (optional) Plug in your Oculus headset.  The code should still work even if you don't have one.
* (optional) Install the [VR.js](https://github.com/benvanik/vr.js/tree/master) plugin and make sure it's working with your Oculus.
* Hit F11 to make the browser fullscreen on your Oculus display.
* The mouse can be used on the left eye to navigate.  Number keys take you to some pre-set locations.  Arrow keys allow some movement.

### About

#### Stereo Rendering
To render stereo images within Cesium using a single scene and dual canvases the workflow is as follows.

For each frame:

* Set scene and postprocess parameters for right eye.
* Render into left eye canvas.
* Canvas copy from left eye canvas to right eye canvas.
* Set scene and postprocess patameters for left eye.
* Render into left eye canvas.

#### Postprocessing
The Oculus reference shader provided in the Oculus SDK compensates for distortion and chromatic aberration.
We have applied a minimal modification to the reference shader which compensates for the coordinate system difference of rendering to a separate canvas for each eye.
Applying a postprocessing filter is facilitated in Cesium by using the postprocess-hook branch.

#### Frustum offsetting
We have applied a small modification to Cesium's PerspectiveFrustum class.
This allows us to apply the required frustum offset e.g. so the standard globe doesn't render in the center of each canvas.

#### USB Input
We are currently leveraging the [VR.js](https://github.com/benvanik/vr.js/tree/master) browser plugin.
This allows us to access the hardware parameters of the Oculus device, along with low latency orientation values to hook into the Cesium 3D camera.
We may look to a different solution for this component in the future.

#### Testing
At time of writing we have tested **cesium-oculus-plugin** in Chrome and Firefox on Windows with the Oculus Rift Development Kit 1.
Stereo rendering should work on other platforms but VR.js may not.

#### Contributing
Please let us know if you spot any errors in our implementation or have a useful extension.  The best way to do this is via a pull request.

### License

The **cesium-oculus-plugin** plugin code is released under Apache 2.0 (see LICENSE.md)

This software will need to go and acquire third party software in order to work properly;
and NICTA is not suggesting that downloading and using the third party software is necessarily
compliant with, or compatible with the Apache 2.0 license; and
Use of the third party software is entirely at the discretion (and risk) of the licensee.
