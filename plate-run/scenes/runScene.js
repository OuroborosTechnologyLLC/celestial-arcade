import * as Phaser from '../libs/phaser.esm.js';
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
	}

	preload() {
		this.load.spritesheet('spookyTrees', '../assets/spooky_trees.png', { frameWidth: 59, frameHeight: 148 });
		this.load.spritesheet('hat', '../assets/spritesheets/hat-man-idle.png', { frameWidth: 39, frameHeight: 52 });
		this.load.spritesheet('hatWalk', '../assets/spritesheets/hat-man-walk.png', { frameWidth: 39, frameHeight: 52 });
	}

	create() {
		this.cursors = this.input.keyboard.createCursorKeys();

		this.anims.create({
			key: 'hatIdle',
			frames: this.anims.generateFrameNumbers('hat', { start: 0, end: 3, first: 0 }),
			frameRate: 3,
			repeat: -1,
			repeatDelay: 500,
		});
		this.anims.create({
			key: 'hatWalk',
			frames: this.anims.generateFrameNumbers('hatWalk', { start: 0, end: 5, first: 0 }),
			frameRate: 10,
			repeat: -1,
		});
		this.anims.create({
			key: 'hatRun',
			frames: this.anims.generateFrameNumbers('hatWalk', { start: 0, end: 5, first: 0 }),
			frameRate: 15,
			repeat: -1,
		});
		const scale = this.scale;
		this.player = this.add.sprite(scale.width / 2, scale.height / 2, 'hat');
		this.player.setScale(2, 2);
		this.player.play('hatIdle');

		const camera = this.cameras.main;
		this.fx = camera.postFX.addVignette(0.5, 0.5, settings.CAMERA_RADIUS_START);
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
		this.offsetText = this.add.text(16, 16, '', debugTextConfig).setShadow(1, 1, 'rgba(0, 0, 0, 0.5)', 5).setDepth(999);
		camera.ignore(this.offsetText);
		this.uiCamera.ignore(this.player);
	}

	resize({ width, height }) {
		this.player.setPosition(width / 2, height / 2);
	}

	update(time, delta) {
		if (this.cursors.right.isDown) {
			this.isRunning = true;
			this.cameras.main
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

		if (!this.hasMovedLanes) {
			if (this.cursors.up.isDown) {
				this.currentLane = Math.min(this.currentLane - 1, 0);
				this.hasMovedLanes = true;
			} else if (this.cursors.down.isDown) {
				this.currentLane = Math.max(this.currentLane + 1, 2);
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

		this.player.setPosition(this.scale.width / 2, (this.scale.height / 2) - this.getCurrentLaneOffset());
		this.offsetText.setText(`offset: ${offset}`);
	}

	getCurrentLaneOffset() {
		return 0;
	}
}
