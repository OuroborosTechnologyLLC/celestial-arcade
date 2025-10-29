import * as Phaser from '../libs/phaser.esm.js';
import { settings } from '../settings.js';

export default class Tree extends Phaser.Physics.Arcade.Sprite {
	constructor(scene, x, y) {
		super(scene, x, y, 'spookyTrees');
		this.setPosition(x, y);
		scene.add.existing(this);
		scene.physics.add.existing(this);

		this.setScale(2, 2);
		this.setSize(48, 48);
		this.setOffset(10, 100);
		this.setImmovable(true);
	}

	static preload(scene) {
		scene.load.spritesheet('spookyTrees', '../assets/spooky_trees.png', { frameWidth: 59, frameHeight: 148 });
	}

	updatePosition() {
		if (this.x + this.width < 0) {
			this.setPosition(this.scene.scale.width, this.y);
		} else {
			// this.setPosition(Phaser.Math.Linear(this.x, this.x - this.scene.speed, settings.CAMERA_MOVE_RATE), this.y);
			this.setVelocityX(-this.scene.speed);
		}
	}
}

