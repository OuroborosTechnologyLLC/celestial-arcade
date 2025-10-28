import * as Phaser from '../libs/phaser.esm.js';
import { settings } from '../settings.js';

export default class Tree extends Phaser.GameObjects.Sprite {
	constructor(scene, x, y) {
		super(scene, x, y, 'spookyTrees');
		this.setPosition(x, y);
		scene.add.existing(this);

		this.setScale(2, 2);
	}

	static preload(scene) {
		scene.load.spritesheet('spookyTrees', '../assets/spooky_trees.png', { frameWidth: 59, frameHeight: 148 });
	}

	updatePosition() {
		this.setPosition(Phaser.Math.Linear(this.x, this.x - this.scene.speed, settings.CAMERA_MOVE_RATE), this.y);
		if (this.x + this.width < 0) {
			console.log("destroying tree");
			this.destroy();
		}
	}
}

