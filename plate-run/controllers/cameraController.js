export default class CameraController {
	constructor(scene, target) {
		this.scene = scene;
		this.camera = scene.cameras.main;
		this.target = target;
		this.setupEffects();
	}
	
	setupEffects() {
		// this.vignette = this.camera.postFX.addVignette(...);
	}
	
	setRunningMode(isRunning) {
		// Adjust vignette, offset, etc.
	}
	
	update(delta) {
		// Smooth camera offset updates
	}
}
