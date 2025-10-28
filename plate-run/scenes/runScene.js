import * as Phaser from '../libs/phaser.esm.js';
import Player from '../objects/player.js';
import Tree from '../objects/tree.js';
import { settings } from '../settings.js';

export default class RunScene extends Phaser.Scene {
	constructor() {
		super('RunScene');
		this.cameraOffsetX = 0;
		this.currentLane = 1;
		this.fx = null;
		this.isMoving = true;
		this.isRunning = false;
		this.speed = settings.MIN_SPEED;
		this.debugTexts = [];
	}

	preload() {
		Player.preload(this);
		Tree.preload(this);
	}

	create() {
		Player.createAnimations(this);

		this.cursors = this.input.keyboard.createCursorKeys();

		const scale = this.scale;
		this.player = new Player(this, scale.width / 2, scale.height / 2);
		this.tree = new Tree(this, scale.width, scale.height / 2);

		const camera = this.cameras.main;
		this.fx = camera.postFX.addVignette(0.5, 0.5, settings.CAMERA_RADIUS_START, 0.5);
		camera.setOrigin(0.5).setPosition(0, 0).setBackgroundColor('#3d2d22').startFollow(this.player, true, 0.1, 0.1);

		this.uiCamera = this.cameras.add(0, 0, scale.width, scale.height);
		this.uiCamera.setBackgroundColor('rgba(0,0,0,0)');

		scale.on('resize', this.resize, this);
		this.resize({ width: scale.width, height: scale.height });

		const debugTextConfig = {
			font: '14px Monospace',
			fill: '#ffffff',
			stroke: '#000000',
			strokeThickness: 2,
		};
		this.debugTexts.push(this.offsetText = this.add.text(0, 0, '', debugTextConfig));
		this.debugTexts.push(this.laneText = this.add.text(0, 0, '', debugTextConfig));
		this.debugTexts.push(this.speedText = this.add.text(0, 0, '', debugTextConfig));
		this.debugTexts.forEach((a, i) => {
			a.setShadow(1, 1, 'rgba(0, 0, 0, 0.5)', 5).setDepth(999);
			if (i > 0) {
				a.setPosition(16, 18 + (16 * i));
			} else {
				a.setPosition(16, 16);
			}
			camera.ignore(a);
		});
		this.uiCamera.ignore(this.player);
		this.uiCamera.ignore(this.tree);
	}

	resize({ width, height }) {
		this.player.resize(width, height);
	}

	update(time, delta) {
		if (this.cursors.right.isDown) {
			this.isRunning = true;
			this.speed = settings.MAX_SPEED;
		} else if (this.cursors.left.isDown) {
			this.isMoving = false;
			this.speed = 0;
		} else {
			this.isMoving = true;
			this.isRunning = false;
			this.speed = settings.MIN_SPEED;
		}

		if (this.isRunning && this.fx.radius >= settings.CAMERA_RADIUS_END) {
			this.fx.radius -= 0.01;
		} else if (!this.isRunning && this.fx.radius <= settings.CAMERA_RADIUS_START) {
			this.fx.radius += 0.01;
		}

		const offset = this.cursors.right.isDown ? -100 : 0;
		this.cameraOffsetX = Phaser.Math.Linear(this.cameraOffsetX, offset, 0.1);
		this.cameras.main.setFollowOffset(this.cameraOffsetX, 0);

		if (!this.hasMovedLanes && this.isMoving) {
			if (this.cursors.up.isDown) {
				this.currentLane = Math.max(this.currentLane - 1, 0);
				this.hasMovedLanes = true;
			} else if (this.cursors.down.isDown) {
				this.currentLane = Math.min(this.currentLane + 1, 2);
				this.hasMovedLanes = true;
			}
		} else if (this.cursors.up.isUp && this.cursors.down.isUp) {
			this.hasMovedLanes = false;
		}

		if (this.isRunning && this.player.anims.currentAnim.key !== 'hatRun') {
			this.player.play('hatRun');
		} else if (!this.isRunning && this.isMoving && this.player.anims.currentAnim.key !== 'hatWalk') {
			this.player.play('hatWalk');
		} else if (!this.isRunning && !this.isMoving && this.player.anims.currentAnim.key !== 'hatIdle') {
			this.player.play('hatIdle');
		}

		this.player.updatePosition();
		this.tree.updatePosition();
		this.offsetText.setText(`offset (x): ${offset}`);
		this.laneText.setText(`lane: ${this.currentLane}`);
		this.speedText.setText(`speed: ${this.speed}`);
	}
}
