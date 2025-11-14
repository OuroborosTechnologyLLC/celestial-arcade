import * as Phaser from '../libs/phaser.esm.js';
import { settings } from '../settings.js';

export default class CameraController {
	constructor(scene, target) {
		this.scene = scene;
		this.camera = scene.cameras.main;
		this.uiCamera = null;
		this.target = target;
		this.offset = 0;
		this.setupEffects();
	}
	
	setupEffects() {
		this.vignette = this.camera.postFX.addVignette(0.5, 0.5, settings.CAMERA_RADIUS_START, 0.5);
		this.camera.setOrigin(0.5).setPosition(0, 0).setBackgroundColor('#3d2d22').startFollow(this.target, true, 0.1, 0.1);
		// this.camera.setOrigin(0.5).setPosition(0, 0).setBackgroundColor('#3d2d22');
		this.uiCamera = this.scene.cameras.add(0, 0, this.scene.scale.width, this.scene.scale.height);
		this.uiCamera.setBackgroundColor('rgba(0,0,0,0)');
	}
	
	setRunningMode(isRunning) {
		const localOffset = isRunning ? -settings.CAMERA_RUNNING_OFFSET : 0;
		this.offset = Phaser.Math.Linear(this.offset, localOffset, settings.CAMERA_MOVE_RATE);
		this.camera.setFollowOffset(this.offset, 0);
		if (isRunning && this.vignette.radius >= settings.CAMERA_RADIUS_END) {
			this.vignette.radius -= 0.01;
		} else if (!isRunning && this.vignette.radius <= settings.CAMERA_RADIUS_START) {
			this.vignette.radius += 0.01;
		}
	}
	
	update(delta, isRunning) {
		this.setRunningMode(isRunning);
	}
}
