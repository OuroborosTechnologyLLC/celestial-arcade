import * as Phaser from '../libs/phaser.esm.js';
import { settings } from '../settings.js';

export default class Player extends Phaser.GameObjects.Sprite {
	constructor(scene, x, y) {
		super(scene, x, y, 'hat');
		this.setPosition(x, y);
		scene.add.existing(this);

		this.setScale(2, 2);
		this.play('hatIdle');
	}

	static preload(scene) {
		scene.load.spritesheet('hat', './assets/spritesheets/hat-man-idle.png', { frameWidth: 39, frameHeight: 52 });
		scene.load.spritesheet('hatWalk', './assets/spritesheets/hat-man-walk.png', { frameWidth: 39, frameHeight: 52 });
	}

	static createAnimations(scene) {
		scene.anims.create({
			key: 'hatIdle',
			frames: scene.anims.generateFrameNumbers('hat', { start: 0, end: 3, first: 0 }),
			frameRate: 3,
			repeat: -1,
			repeatDelay: 500,
		});
		scene.anims.create({
			key: 'hatWalk',
			frames: scene.anims.generateFrameNumbers('hatWalk', { start: 0, end: 5, first: 0 }),
			frameRate: 10,
			repeat: -1,
		});
		scene.anims.create({
			key: 'hatRun',
			frames: scene.anims.generateFrameNumbers('hatWalk', { start: 0, end: 5, first: 0 }),
			frameRate: 15,
			repeat: -1,
		});
	}

	resize(width, height) {
		this.setPosition(width / 2, Phaser.Math.Linear(height / 2, (height / 2) + this.getCurrentLaneOffset(), settings.CAMERA_MOVE_RATE));
	}

	getCurrentLaneOffset() {
		const l = this.scene.currentLane;
		switch (l) {
			case 0:
				return -settings.LANE_OFFSET;
				break;
			case 2:
				return +settings.LANE_OFFSET;
				break;
			case 1:
			default:
				return 0;
				break;
		}
		return 0;
	}

	updatePosition() {
		const scale = this.scene.scale;
		this.setPosition(scale.width / 2, Phaser.Math.Linear(this.y, (scale.height / 2) + this.getCurrentLaneOffset(), settings.CAMERA_MOVE_RATE));
	}
}
