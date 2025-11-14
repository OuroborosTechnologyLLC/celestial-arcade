import * as Phaser from '../libs/phaser.esm.js';
import WorldController from '../controllers/worldController.js';
import DifficultyController from '../controllers/difficultyController.js';
import SpawnController from '../controllers/spawnController.js';
import CameraController from '../controllers/cameraController.js';
import Player from '../objects/player.js';
import Obstacle from '../objects/obstacle.js';
import ProgressionManager from '../modules/progression.js';
import { settings } from '../settings.js';

export default class RunScene extends Phaser.Scene {
	constructor() {
		super('RunScene');
		this.currentLane = 1;
		this.isMoving = true;
		this.isRunning = false;
		this.speed = settings.MIN_SPEED;
		this.debugTexts = [];
		this.score = 0;
		this.distance = 0;
		this.gameOver = false;
	}

	preload() {
		Player.preload(this);
		Obstacle.preload(this);
	}

	create() {
		this.progressionManager = new ProgressionManager();
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
		this.obstacles.add(new Obstacle(this, this.getLanePosition().x, this.getLanePosition().y));

		const debugTextConfig = { font: '14px Monospace', fill: '#ffffff', stroke: '#000000', strokeThickness: 2 };
		this.debugTexts.push(this.offsetText = this.add.text(0, 0, '', debugTextConfig));
		this.debugTexts.push(this.laneText = this.add.text(0, 0, '', debugTextConfig));
		this.debugTexts.push(this.speedText = this.add.text(0, 0, '', debugTextConfig));
		this.debugTexts.push(this.scoreText = this.add.text(0, 0, '', { font: '20px Monospace', fill: '#ffff00', stroke: '#000000', strokeThickness: 3 }));
		this.debugTexts.forEach((a, i) => {
			a.setShadow(1, 1, 'rgba(0, 0, 0, 0.5)', 5).setDepth(999);
			if (i > 0 && i < 3) {
				a.setPosition(16, 18 + (16 * i));
			} else if (i === 0) {
				a.setPosition(16, 16);
			} else if (i === 3) {
				a.setPosition(scale.width - 150, 16);
			}
			this.cameraController.camera.ignore(a);
		});
		this.cameraController.uiCamera.ignore(this.player);
		this.cameraController.uiCamera.ignore(this.obstacles);
	}

	resize({ width, height }) {
		this.player.resize(width, height);
	}

	update(time, delta) {
		if (this.gameOver) return;
		this.handleInput();
		this.difficultyController.update(delta, this.isRunning);
		this.spawnController.update(delta);
		this.cameraController.update(delta, this.isRunning);
		this.player.updatePosition();
		this.obstacles.children.entries.forEach((a) => a.updatePosition());
		this.distance += (this.speed * delta) / 1000;
		this.score = Math.floor(this.distance);
		this.offsetText.setText(`offset (x): ${this.cameraController.offset}`);
		this.laneText.setText(`lane: ${this.currentLane}`);
		this.speedText.setText(`speed: ${this.speed}`);
		this.scoreText.setText(`Score: ${this.score}`);

		const playerBounds = this.player.getBounds();
		this.obstacles.children.entries.forEach((a) => {
			const obstacleBounds = a.getBounds();
			if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, obstacleBounds)) {
				this.handleGameOver();
			}
		});
	}

	getLanePosition() {
		return { x: 0, y: 500 };
	}

	handleGameOver() {
		if (this.gameOver) return;
		this.gameOver = true;
		this.speed = 0;
		const coinsEarned = Math.floor(this.score / 10);
		const xpEarned = Math.floor(this.score);
		this.progressionManager.updateProgression({ coinsEarned, xpEarned });
		const scale = this.scale;
		const gameOverText = this.add.text(scale.width / 2, scale.height / 2 - 50, 'GAME OVER', { font: '48px Monospace', fill: '#ff0000', stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5).setDepth(1000);
		const scoreText = this.add.text(scale.width / 2, scale.height / 2, `Score: ${this.score}`, { font: '32px Monospace', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(1000);
		const rewardText = this.add.text(scale.width / 2, scale.height / 2 + 50, `+${coinsEarned} coins  +${xpEarned} XP`, { font: '24px Monospace', fill: '#ffff00', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(1000);
		const restartText = this.add.text(scale.width / 2, scale.height / 2 + 100, 'Press SPACE to restart', { font: '20px Monospace', fill: '#aaaaaa', stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5).setDepth(1000);
		this.cameraController.camera.ignore([gameOverText, scoreText, rewardText, restartText]);
		this.input.keyboard.once('keydown-SPACE', () => this.scene.restart());
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
}
