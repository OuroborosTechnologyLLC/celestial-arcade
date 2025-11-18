import * as Phaser from '../libs/phaser.esm.js';
import WorldController from '../controllers/worldController.js';
import DifficultyController from '../controllers/difficultyController.js';
import SpawnController from '../controllers/spawnController.js';
import CameraController from '../controllers/cameraController.js';
import Player from '../objects/player.js';
import Obstacle from '../objects/obstacle.js';
import { settings } from '../settings.js';

export default class RunScene extends Phaser.Scene {
	constructor() {
		super('RunScene');
		this.currentLane = 1;
		this.isMoving = true;
		this.isRunning = false;
		this.speed = settings.MIN_SPEED;
		this.debugTexts = [];
	}

	preload() {
		Player.preload(this);
		Obstacle.preload(this);
	}

	create() {
		Player.createAnimations(this);
		this.cursors = this.input.keyboard.createCursorKeys();
		const scale = this.scale;
		scale.on('resize', this.resize, this);
		this.player = new Player(this, scale.width / 2, scale.height / 2);
		this.resize({ width: scale.width, height: scale.height });
		this.worldController = new WorldController(this);
		this.difficultyController = new DifficultyController(this);
		this.spawnController = new SpawnController(this, this.worldController, this.difficultyController);
		this.cameraController = new CameraController(this, this.player);
		this.obstacles = this.add.group();
		this.obstacles.add(new Obstacle(this, 0));
		this.obstacles.add(new Obstacle(this, 1));
		this.obstacles.add(new Obstacle(this, 2));

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
			this.cameraController.camera.ignore(a);
		});
		this.cameraController.uiCamera.ignore(this.player);
		this.cameraController.uiCamera.ignore(this.obstacles);
	}

	update(time, delta) {
		this.handleInput();
		this.difficultyController.update(delta, this.isRunning);
		this.spawnController.update(delta);
		this.cameraController.update(delta, this.isRunning);
		this.player.updatePosition();
		this.obstacles.children.entries.forEach((a) => a.updatePosition());
		this.offsetText.setText(`offset (x): ${this.cameraController.offset}`);
		this.laneText.setText(`lane: ${this.currentLane}`);
		this.speedText.setText(`speed: ${this.speed}`);

		const playerBounds = this.player.getBounds();
		this.obstacles.children.entries.forEach((a) => {
			const obstacleBounds = a.getBounds();

			if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, obstacleBounds)) {
				console.log("Overlap detected!");
				this.handleTreeOverlap(this.player, a);
			}
		});
	}

	getLanePosition() {
		return { x: 0, y: 500 };
	}

	handleInput() {
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
	}

	handleResize({ width, height }) {
		this.player.resize(width, height);
	}

	handleTreeOverlap(a, b) {
		return;
	}
}
