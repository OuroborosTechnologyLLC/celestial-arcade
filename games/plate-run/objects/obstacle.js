import * as Phaser from '../libs/phaser.esm.js';
import { settings } from '../settings.js';

export default class Obstacle extends Phaser.GameObjects.Sprite {
	constructor(scene, lane) {
		const x = scene.scale.width;
		const y = (lane + 1) * 500;
		super(scene, x, y, 'spookyTrees');
		this.y = y;
		this.setPosition(x, y);
		scene.add.existing(this);

		this.setScale(2, 2);
	}

	static preload(scene) {
		scene.load.spritesheet('spookyTrees', '../assets/spooky_trees.png', { frameWidth: 59, frameHeight: 148 });
	}

	updatePosition() {
		if (this.x + this.width < 0) {
			this.setPosition(this.scene.scale.width + this.width, this.y);
		} else {
			// this.setPosition(Phaser.Math.Linear(this.x, this.x - this.scene.speed, settings.CAMERA_MOVE_RATE), this.y);
			this.setPosition(this.x - this.scene.speed, this.y);
		}
	}
}


